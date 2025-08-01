// src-tauri/src/credentials.rs

//! Core logic for secure credential management using the OS keychain.

// === MODULE IMPORTS ===
use anyhow::Result; // Use anyhow::Result for robust error handling within the module
use argon2::{
    password_hash::{
        rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString
    },
    Argon2
};
use keyring::Entry;

// === CONSTANTS ===

/// A unique service name for your application in the OS keychain to prevent collisions.
const KEYRING_SERVICE: &str = "com.yourscheduler.credentials";

// === PUBLIC FUNCTIONS ===

/// Implements the logic for setting or updating the master password.
/// The password hash is stored securely in the OS keychain.
pub async fn setup_master_password(password: String) -> Result<()> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| anyhow::anyhow!("Failed to hash password: {}", e))?
        .to_string();

    let entry = Entry::new(KEYRING_SERVICE, "master_password_hash")?;
    entry.set_password(&password_hash)?;
    Ok(())
}

/// Implements the logic for storing a generic secret in the OS keychain.
pub async fn store_secret_key(key_name: String, secret_value: String) -> Result<()> {
    let entry = Entry::new(KEYRING_SERVICE, &key_name)?;
    entry.set_password(&secret_value)?;
    Ok(())
}

/// Implements the core verification and retrieval logic.
/// Verifies the master password and, if correct, retrieves a stored secret.
pub async fn get_secret_with_authorization(
    key_name: String,
    master_password: String,
) -> Result<String> {
    // 1. Retrieve the stored password hash from the keychain
    let hash_entry = Entry::new(KEYRING_SERVICE, "master_password_hash")?;
    
    let stored_hash_str = hash_entry.get_password()
        .map_err(|_| anyhow::anyhow!("Master password not set up. Please set a master password first."))?;

    let parsed_hash = PasswordHash::new(&stored_hash_str)
        .map_err(|e| anyhow::anyhow!("Failed to parse password hash: {}", e))?;

    // 2. Verify the provided password against the stored hash
    if Argon2::default().verify_password(master_password.as_bytes(), &parsed_hash).is_err() {
        // Return a specific error that the frontend can display
        return Err(anyhow::anyhow!("Invalid master password."));
    }

    // 3. If verification is successful, retrieve and return the requested secret
    let secret_entry = Entry::new(KEYRING_SERVICE, &key_name)?;

    let secret = secret_entry.get_password()
        .map_err(|_| anyhow::anyhow!("Secret '{}' not found.", key_name))?;

    Ok(secret)
}