use crate::{
    chrome_functions::{fetch_latest_chrome_version, sync_chrome_resources},
    database_functions::{load_connect_info, SystemRepository},
    ConnectInfo, DbPool,
};
use anyhow::Result;
use std::sync::Arc;
use tokio::sync::Mutex;

// This function now orchestrates the entire setup process.
pub async fn setup_program(
    pool: &DbPool,
    connect_info_arc: Arc<Mutex<ConnectInfo>>,
) -> Result<(), anyhow::Error> {
    // 1. Determine the current OS.
    let os_string = determine_os_string();

    // 2. Load connection info from the database. If it doesn't exist, create it.
    let mut stored_info = load_connect_info(pool, os_string)?;

    // 3. Fetch the latest version from the web.
    let latest_version = fetch_latest_chrome_version().await?;
    println!("Latest Chrome version available: {}", latest_version);
    println!("Stored Chrome version: {}", stored_info.version);

    // 4. Compare versions and decide if an update is needed.
    let needs_update = stored_info.version != latest_version;
    if needs_update {
        println!("New Chrome version found. Updating database.");
        SystemRepository::update_version(latest_version.clone(), pool).await?;
        stored_info.version = latest_version; // Update in-memory struct
    }

    // 5. Sync local chrome/chromedriver files if needed (due to version change or missing files).
    sync_chrome_resources(&stored_info, needs_update).await?;
    
    // 6. Update the shared state in Tauri with the final, correct info.
    {
        let mut app_state_info = connect_info_arc.lock().await;
        *app_state_info = stored_info;
    }
    
    println!("Program setup complete!");
    Ok(())
}

// Helper to get the OS-specific string.
fn determine_os_string() -> String {
    if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") { "mac-arm64".to_string() } else { "mac-x64".to_string() }
    } else if cfg!(target_os = "windows") {
        "win64".to_string()
    } else if cfg!(target_os = "linux") {
        "linux64".to_string()
    } else {
        "unsupported".to_string()
    }
}