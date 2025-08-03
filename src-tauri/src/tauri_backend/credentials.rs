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
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize}; // Make sure serde is imported
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tracing::{info, warn};
use zeroize::{Zeroize, Zeroizing}; // Make sure Zeroize is imported for the derive macro

// === CONSTANTS ===
const KEYRING_SERVICE: &str = "com.yourscheduler.credentials";
const MASTER_PASSWORD_HASH_KEY: &str = "master_password_hash";
// Use a single key for the bundled credentials
const APP_CREDENTIALS_KEY: &str = "app_credentials_bundle";

// === RATE LIMITING STATE (Singleton) ===
lazy_static! {
    static ref FAILED_ATTEMPTS: Mutex<HashMap<String, (u32, Instant)>> =
        Mutex::new(HashMap::new());
}

// === NEW STRUCT FOR BUNDLED CREDENTIALS ===
#[derive(Serialize, Deserialize, Zeroize, zeroize::ZeroizeOnDrop)]
struct StoredCredentials {
    username: String,
    password: String, // This will be zeroized automatically when the struct is dropped
}


// === PRIVATE HELPER FUNCTIONS (Unchanged) ===

/// Checks if the user is currently rate-limited.
fn check_rate_limit() -> Result<()> {
    let mut attempts = FAILED_ATTEMPTS.lock().unwrap();
    if let Some((count, first_attempt)) = attempts.get_mut(KEYRING_SERVICE) {
        if first_attempt.elapsed() > Duration::from_secs(600) { *count = 0; }
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
    entry.0 += 1;
    entry.1 = Instant::now();
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
    if Argon2::default().verify_password(master_password.as_bytes(), &parsed_hash).is_ok()
    {
        clear_failed_attempts();
        info!("Master password verification successful.");
        Ok(())
    } else {
        record_failed_attempt();
        Err(anyhow!("Invalid master password."))
    }
}

// === PUBLIC API FUNCTIONS (Unchanged is_master_password_set, setup_master_password, change_master_password) ===

pub async fn is_master_password_set() -> Result<bool> {
    info!("Checking for existence of master password hash.");
    match Entry::new(KEYRING_SERVICE, MASTER_PASSWORD_HASH_KEY) {
        Ok(entry) => match entry.get_password() {
            Ok(_) => { info!("Master password hash found."); Ok(true) },
            Err(keyring::Error::NoEntry) => { info!("Master password hash not found. App requires setup."); Ok(false) },
            Err(e) => Err(anyhow!("Error accessing keychain: {}", e)),
        },
        Err(e) => Err(anyhow!("Error creating keychain entry: {}", e)),
    }
}

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

pub async fn change_master_password(old_password: Zeroizing<String>, new_password: Zeroizing<String>) -> Result<()> {
    info!("Attempting to change master password.");
    verify_master_password(&old_password).await?;
    info!("Old password verified. Proceeding to set new master password.");
    setup_master_password(new_password).await
}

// === UPDATED CREDENTIAL FUNCTIONS ===

/// Stores or updates application credentials (username/password).
/// Requires master password authorization.
pub async fn store_credentials(
    username: String,
    password: Zeroizing<String>,
    master_password: Zeroizing<String>,
) -> Result<()> {
    info!("Attempting to store/update application credentials.");
    // 1. Authorize with the master password. (1st keychain access)
    verify_master_password(&master_password).await?;

    // 2. Bundle credentials into the struct.
    // We clone the inner string from the Zeroizing wrapper.
    let credentials_bundle = StoredCredentials {
        username,
        password: (*password).clone(),
    };

    // 3. Serialize the bundle to a JSON string.
    let credentials_json = serde_json::to_string(&credentials_bundle)
        .map_err(|e| anyhow!("Failed to serialize credentials: {}", e))?;

    // 4. Store the single JSON string in the keychain. (2nd keychain access)
    let entry = Entry::new(KEYRING_SERVICE, APP_CREDENTIALS_KEY)?;
    entry.set_password(&credentials_json)?;
    info!("Application credentials bundle stored/updated in keychain.");
    // `credentials_bundle` is dropped here, and its `password` field is zeroized.
    // The original `password: Zeroizing<String>` is also dropped and zeroized.
    Ok(())
}

/// Retrieves the stored application credentials.
/// Requires master password authorization.
pub async fn get_credentials(
    master_password: Zeroizing<String>,
) -> Result<(String, Zeroizing<String>)> {
    info!("Attempting to retrieve application credentials.");
    // 1. Authorize with the master password. (1st keychain access)
    verify_master_password(&master_password).await?;

    // 2. Retrieve the single JSON string from the keychain. (2nd keychain access)
    let entry = Entry::new(KEYRING_SERVICE, APP_CREDENTIALS_KEY)?;
    let credentials_json = entry
        .get_password()
        .map_err(|_| anyhow!("Application credentials not found."))?;

    // 3. Deserialize the JSON back into the struct.
    let credentials_bundle: StoredCredentials = serde_json::from_str(&credentials_json)
        .map_err(|e| anyhow!("Failed to deserialize credentials: {}", e))?;

    info!("Successfully retrieved application credentials.");
    // We return the username and re-wrap the password string in a Zeroizing wrapper
    // for safe handling by the caller. The `credentials_bundle` is then dropped and zeroized.
    Ok((
        credentials_bundle.username.clone(),
        Zeroizing::new(credentials_bundle.password.clone()),
    ))
}

/// Retrieves credentials without master password verification (e.g., for auto-login).
pub async fn get_credentials_free() -> Result<(String, Zeroizing<String>)> {
    info!("Attempting to retrieve application credentials without master password.");

    // 1. Retrieve the single JSON string from the keychain. (1 keychain access)
    let entry = Entry::new(KEYRING_SERVICE, APP_CREDENTIALS_KEY)?;
    let credentials_json = entry
        .get_password()
        .map_err(|_| anyhow!("Application credentials not found."))?;

    // 2. Deserialize the JSON back into the struct.
    let credentials_bundle: StoredCredentials = serde_json::from_str(&credentials_json)
        .map_err(|e| anyhow!("Failed to deserialize credentials: {}", e))?;

    info!("Successfully retrieved application credentials.");
    // Re-wrap the password in a Zeroizing wrapper for safe handling by the caller.
    Ok((
        credentials_bundle.username.clone(),
        Zeroizing::new(credentials_bundle.password.clone()),
    ))
}