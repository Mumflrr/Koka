//! Core logic for secure credential management using the OS keychain.
//! Implements memory-safe password handling and rate limiting.

use anyhow::{anyhow, Result};
use argon2::{
    password_hash::{
        rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString,
    },
    Argon2,
};
use keyring::Entry;
use lazy_static::lazy_static; // For global rate-limiting state
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tracing::{info, warn}; // For audit logging
use zeroize::{Zeroize, Zeroizing}; // For securely erasing sensitive data from memory

// === CONSTANTS ===
const KEYRING_SERVICE: &str = "com.yourscheduler.credentials";
const MASTER_PASSWORD_HASH_KEY: &str = "master_password_hash";
const APP_USERNAME_KEY: &str = "app_username";
const APP_PASSWORD_KEY: &str = "app_password";

// === RATE LIMITING STATE (Singleton) ===
lazy_static! {
    // Stores failed login attempts to implement an exponential backoff.
    // Key: A static identifier for the resource being protected (master password).
    // Value: (failure_count, time_of_first_failure)
    static ref FAILED_ATTEMPTS: Mutex<HashMap<String, (u32, Instant)>> =
        Mutex::new(HashMap::new());
}

// === PRIVATE HELPER FUNCTIONS ===

/// Checks if the user is currently rate-limited.
fn check_rate_limit() -> Result<()> {
    let mut attempts = FAILED_ATTEMPTS.lock().unwrap();
    if let Some((count, first_attempt)) = attempts.get_mut(KEYRING_SERVICE) {
        // Reset counter if it's been a long time since the first failure
        if first_attempt.elapsed() > Duration::from_secs(600) { // 10 minutes
            *count = 0;
        }

        // Exponential backoff: 2^n seconds delay
        let delay_seconds = 2_u64.pow(*count);
        let delay = Duration::from_secs(delay_seconds);

        if first_attempt.elapsed() < delay {
            warn!("Rate limit triggered. User must wait.");
            return Err(anyhow!(
                "Too many failed attempts. Please wait {} seconds.",
                delay.as_secs() - first_attempt.elapsed().as_secs()
            ));
        }
    }
    Ok(())
}

/// Records a failed authentication attempt.
fn record_failed_attempt() {
    let mut attempts = FAILED_ATTEMPTS.lock().unwrap();
    let entry = attempts.entry(KEYRING_SERVICE.to_string()).or_insert((0, Instant::now()));
    entry.0 += 1; // Increment failure count
    entry.1 = Instant::now(); // Update timestamp to the latest attempt
    warn!("Failed master password verification recorded. Attempt count: {}", entry.0);
}

/// Clears failed attempt records upon successful authentication.
fn clear_failed_attempts() {
    if FAILED_ATTEMPTS.lock().unwrap().remove(KEYRING_SERVICE).is_some() {
        info!("Failed attempt counter reset after successful login.");
    }
}

/// The core verification logic. This is now a separate, reusable function.
/// It verifies the master password and handles rate limiting.
async fn verify_master_password(master_password: &Zeroizing<String>) -> Result<()> {
    info!("Master password verification initiated.");
    check_rate_limit()?;

    let hash_entry = Entry::new(KEYRING_SERVICE, MASTER_PASSWORD_HASH_KEY)?;
    let stored_hash_str = hash_entry.get_password().map_err(|_| {
        warn!("Attempted verification but master password is not set up.");
        anyhow!("Master password not set up. Please set a master password first.")
    })?;

    let parsed_hash = PasswordHash::new(&stored_hash_str)
        .map_err(|e| anyhow!("Failed to parse stored password hash: {}", e))?;

    if Argon2::default()
        .verify_password(master_password.as_bytes(), &parsed_hash)
        .is_ok()
    {
        clear_failed_attempts();
        info!("Master password verification successful.");
        Ok(())
    } else {
        record_failed_attempt();
        Err(anyhow!("Invalid master password."))
    }
}

// === PUBLIC API FUNCTIONS ===

/// Checks if the master password has been set in the keychain.
pub async fn is_master_password_set() -> Result<bool> {
    info!("Checking for existence of master password hash.");
    match Entry::new(KEYRING_SERVICE, MASTER_PASSWORD_HASH_KEY) {
        Ok(entry) => match entry.get_password() {
            Ok(_) => {
                info!("Master password hash found.");
                Ok(true) // Found it
            },
            // This specific error from keyring means the entry doesn't exist
            Err(keyring::Error::NoEntry) => {
                info!("Master password hash not found. App requires setup.");
                Ok(false)
            },
            Err(e) => Err(anyhow!("Error accessing keychain: {}", e)), // Other error
        },
        Err(e) => Err(anyhow!("Error creating keychain entry: {}", e)),
    }
}

/// Sets the initial master password. This should only be used once.
/// Uses `Zeroizing<String>` to ensure the password is cleared from memory.
pub async fn setup_master_password(password: Zeroizing<String>) -> Result<()> {
    info!("Setting up new master password.");
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| anyhow!("Failed to hash password: {}", e))?
        .to_string();

    let entry = Entry::new(KEYRING_SERVICE, MASTER_PASSWORD_HASH_KEY)?;
    entry.set_password(&password_hash)?;
    info!("Master password hash stored securely in keychain.");
    Ok(())
}

/// Changes the master password, requiring the old one for authorization.
pub async fn change_master_password(
    old_password: Zeroizing<String>,
    new_password: Zeroizing<String>,
) -> Result<()> {
    info!("Attempting to change master password.");
    // 1. Authorize with the old password. This also leverages our rate limiting.
    verify_master_password(&old_password).await?;

    // 2. If authorized, hash and store the new password.
    info!("Old password verified. Proceeding to set new master password.");
    setup_master_password(new_password).await
}

/// Stores or updates application credentials (username/password).
/// Requires master password authorization.
pub async fn store_credentials(
    username: String,
    password: Zeroizing<String>,
    master_password: Zeroizing<String>,
) -> Result<()> {
    info!("Attempting to store/update application credentials.");
    // 1. Authorize with the master password.
    verify_master_password(&master_password).await?;

    // 2. Store username.
    let user_entry = Entry::new(KEYRING_SERVICE, APP_USERNAME_KEY)?;
    user_entry.set_password(&username)?;
    info!("Application username stored/updated in keychain.");

    // 3. Store password.
    let pass_entry = Entry::new(KEYRING_SERVICE, APP_PASSWORD_KEY)?;
    pass_entry.set_password(password.as_str())?;
    info!("Application password stored/updated in keychain.");
    // `password` is zeroized when it goes out of scope here.

    Ok(())
}

/// Retrieves the stored application credentials.
/// Requires master password authorization.
pub async fn get_credentials(
    master_password: Zeroizing<String>,
) -> Result<(String, Zeroizing<String>)> {
    info!("Attempting to retrieve application credentials.");
    // 1. Authorize with the master password.
    verify_master_password(&master_password).await?;

    // 2. Retrieve username.
    let user_entry = Entry::new(KEYRING_SERVICE, APP_USERNAME_KEY)?;
    let username = user_entry
        .get_password()
        .map_err(|_| anyhow!("Application username not found."))?;

    // 3. Retrieve password.
    let pass_entry = Entry::new(KEYRING_SERVICE, APP_PASSWORD_KEY)?;
    let password = pass_entry
        .get_password()
        .map_err(|_| anyhow!("Application password not found."))?;

    info!("Successfully retrieved application credentials.");
    // Wrap the retrieved password in Zeroizing to maintain memory safety.
    Ok((username, Zeroizing::new(password)))
}