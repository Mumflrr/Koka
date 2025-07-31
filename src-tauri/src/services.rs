//! Chrome and ChromeDriver management service for web scraping operations
//! 
//! This module handles the automatic download, installation, and management of Chrome browser
//! and ChromeDriver binaries across different operating systems (Windows, macOS, Linux).
//! It ensures that the correct versions are available for web scraping operations and handles
//! version updates automatically.

#[cfg(not(target_os = "windows"))]
use std::os::unix::fs::PermissionsExt;
use std::{collections::HashMap, env, fs::{self, File}, io::{copy, BufReader}, net::TcpStream, path::PathBuf, process::Command, time::Duration};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use thirtyfour::{ChromiumLikeCapabilities, DesiredCapabilities, WebDriver};
use zip::ZipArchive;
use anyhow::Context;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::{
    database_functions::{load_connect_info, SystemRepository},
    ConnectInfo, DbPool,
};

// === CONSTANTS ===

/// Directory name for storing Chrome and ChromeDriver resources
const RESOURCES_DIR: &str = "resources";

/// Base URL for Chrome for Testing downloads from Google's official repository
const CHROME_URL: &str = "https://storage.googleapis.com/chrome-for-testing-public";

// === UTILITY STRUCTURES ===

/**
 * HTTP client wrapper for downloading Chrome resources
 * Provides methods for downloading files and extracting ZIP archives
 */
struct Downloader {
    /// HTTP client for making download requests
    client: Client,
}

impl Downloader {
    /**
     * Creates a new downloader instance with default HTTP client
     * 
     * @returns {Downloader} New downloader instance
     */
    fn new() -> Self {
        Self { client: Client::new() }
    }

    /**
     * Downloads a file from URL to specified local path
     * 
     * @param {&str} url - URL to download from
     * @param {&PathBuf} output_path - Local path to save the downloaded file
     * @returns {Result<(), anyhow::Error>} Success or error result
     * @throws {anyhow::Error} If download fails or file cannot be created
     */
    async fn download_to_file(&self, url: &str, output_path: &PathBuf) -> Result<(), anyhow::Error> {
        let response = self.client.get(url).send().await?.error_for_status()?;
        let mut file = File::create(output_path)?;
        copy(&mut response.bytes().await?.as_ref(), &mut file)?;
        Ok(())
    }

    /**
     * Extracts a ZIP archive to specified directory
     * 
     * @param {&PathBuf} zip_path - Path to the ZIP file to extract
     * @param {&PathBuf} extract_dir - Directory to extract contents to
     * @returns {Result<(), anyhow::Error>} Success or error result
     * @throws {anyhow::Error} If ZIP file cannot be read or extracted
     */
    fn extract_zip(&self, zip_path: &PathBuf, extract_dir: &PathBuf) -> Result<(), anyhow::Error> {
        let zip_file = File::open(zip_path)?;
        let mut archive = ZipArchive::new(BufReader::new(zip_file))?;
        archive.extract(extract_dir)?;
        Ok(())
    }
}

// === API RESPONSE STRUCTURES ===

/**
 * Response structure for Chrome version API
 * Contains version information for different Chrome release channels
 */
#[derive(Debug, Serialize, Deserialize)]
struct LatestVersion {
    /// Timestamp of when the version information was last updated
    timestamp: String,
    /// Map of channel names to their version information
    channels: HashMap<String, Channel>,
}

/**
 * Chrome release channel information
 * Contains version details for a specific release channel (Stable, Beta, etc.)
 */
#[derive(Debug, Serialize, Deserialize)]
struct Channel {
    /// Channel name (e.g., "Stable", "Beta")
    channel: String,
    /// Version number (e.g., "120.0.6099.109")
    version: String,
    /// Build revision identifier
    revision: String,
}

// === PUBLIC API FUNCTIONS ===

/**
 * Main setup function that orchestrates the entire Chrome setup process
 * 
 * This function handles the complete Chrome/ChromeDriver setup workflow:
 * 1. Determines the current operating system
 * 2. Loads or creates connection info in the database
 * 3. Fetches the latest Chrome version from Google's API
 * 4. Compares versions and updates database if needed
 * 5. Downloads and installs Chrome/ChromeDriver if required
 * 6. Updates the shared application state
 * 
 * @param {&DbPool} pool - Database connection pool for storing version info
 * @param {Arc<Mutex<ConnectInfo>>} connect_info_arc - Shared application state for connection info
 * @returns {Result<(), anyhow::Error>} Success or error result
 * @throws {anyhow::Error} If any step in the setup process fails
 */
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
    println!("Latest Chrome version available: {latest_version}");
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

/**
 * Starts ChromeDriver process for web scraping operations
 * 
 * This function:
 * 1. Terminates any existing ChromeDriver processes
 * 2. Configures Chrome capabilities with the correct binary path
 * 3. Starts ChromeDriver on port 9515
 * 4. Waits for ChromeDriver to become available
 * 5. Returns a WebDriver instance for browser automation
 * 
 * @param {&ConnectInfo} connect_info - Connection information containing paths and version
 * @returns {Result<WebDriver, anyhow::Error>} WebDriver instance or error
 * @throws {anyhow::Error} If ChromeDriver fails to start or become available
 */
pub async fn start_chromedriver(connect_info: &ConnectInfo) -> Result<WebDriver, anyhow::Error> {
    quit_chromedriver()?;
    let mut caps = DesiredCapabilities::chrome();
    let binary_path = get_chromebinary_path(connect_info);
    caps.set_binary(&binary_path.to_string_lossy()).context("Unable to set binary path")?;

    let driver_path = get_chromedriver_path(connect_info);
    Command::new(&driver_path)
        .args(["--port=9515", "--verbose", "--log-path=chromedriver.log"])
        .spawn()
        .with_context(|| format!("Failed to start chromedriver from path: {driver_path:?}"))?;
    
    // Wait up to 5 seconds for ChromeDriver to start
    for _ in 0..10 {
        if TcpStream::connect("localhost:9515").is_ok() {
            println!("ChromeDriver is running on port 9515.");
            return WebDriver::new("http://localhost:9515", caps).await.map_err(Into::into);
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }

    Err(anyhow::anyhow!("ChromeDriver did not start on port 9515 in time."))
}

// === PRIVATE HELPER FUNCTIONS ===

/**
 * Determines the operating system string for Chrome downloads
 * Maps Rust's target OS to Chrome's naming convention
 * 
 * @returns {String} OS string compatible with Chrome download URLs
 * 
 * @example
 * // On macOS ARM64: returns "mac-arm64"
 * // On Windows: returns "win64"
 * // On Linux: returns "linux64"
 */
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

/**
 * Terminates existing ChromeDriver processes on Windows
 * Uses Windows-specific tasklist and taskkill commands
 * 
 * @returns {Result<(), anyhow::Error>} Success or error result
 * @throws {anyhow::Error} If process termination fails
 */
#[cfg(target_os = "windows")]
fn quit_chromedriver() -> Result<(), anyhow::Error> {
    let output = Command::new("tasklist")
        .args(&["/FI", "IMAGENAME eq chromedriver.exe", "/FO", "CSV", "/NH"])
        .output()?;
    let output_str = String::from_utf8(output.stdout)?;
    if output_str.contains("chromedriver.exe") {
        println!("Chromedriver processes found. Terminating...");
        let kill_output = Command::new("taskkill")
            .args(&["/F", "/IM", "chromedriver.exe"])
            .output()?;
        if !kill_output.status.success() {
            let error_message = String::from_utf8(kill_output.stderr)?;
            return Err(anyhow::anyhow!("Failed to terminate ChromeDriver: {}", error_message));
        }
        println!("All chromedriver processes have been terminated.");
    } else {
        println!("No chromedriver processes found.");
    }
    Ok(())
}

/**
 * Terminates existing ChromeDriver processes on Unix-like systems (macOS, Linux)
 * Uses Unix-specific pgrep and pkill commands
 * 
 * @returns {Result<(), anyhow::Error>} Success or error result
 * @throws {anyhow::Error} If process termination fails
 */
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn quit_chromedriver() -> Result<(), anyhow::Error> {
    let output = Command::new("pgrep").arg("chromedriver").output()?;
    if !output.stdout.is_empty() {
        println!("Chromedriver processes found. Terminating...");
        let kill_output = Command::new("pkill").arg("chromedriver").output()?;
        if !kill_output.status.success() {
            let error_message = String::from_utf8(kill_output.stderr)?;
            return Err(anyhow::anyhow!("Failed to terminate ChromeDriver: {}", error_message));
        }
        println!("All chromedriver processes have been terminated.");
    } else {
        println!("No chromedriver processes found to kill.");
    }
    Ok(())
}

/**
 * Fetches the latest stable Chrome version from Google's API
 * 
 * @returns {Result<String, anyhow::Error>} Latest stable version string or error
 * @throws {anyhow::Error} If API request fails or response is invalid
 * 
 * @example
 * ```rust
 * let version = fetch_latest_chrome_version().await?;
 * println!("Latest Chrome version: {}", version); // e.g., "120.0.6099.109"
 * ```
 */
async fn fetch_latest_chrome_version() -> Result<String, anyhow::Error> {
    let client = Client::builder().timeout(Duration::from_secs(30)).build()?;
    let url = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json";
    let response: LatestVersion = client.get(url).send().await?.json().await?;
    let stable_version = response
        .channels
        .get("Stable")
        .ok_or_else(|| anyhow::anyhow!("Stable channel not found in JSON response"))?
        .version
        .clone();
    Ok(stable_version)
}

/**
 * Synchronizes local Chrome resources with required versions
 * Downloads and installs Chrome/ChromeDriver if update is needed or files are missing
 * 
 * @param {&ConnectInfo} connect_info - Connection information with version and OS details
 * @param {bool} needs_update - Whether a version update is required
 * @returns {Result<(), anyhow::Error>} Success or error result
 * @throws {anyhow::Error} If download or installation fails
 */
async fn sync_chrome_resources(connect_info: &ConnectInfo, needs_update: bool) -> Result<(), anyhow::Error> {
    if needs_update || check_for_invalid_paths(connect_info) {
        setup_chrome_and_driver(connect_info).await?;
        println!("Chrome resources are now up-to-date.");
    } else {
        println!("Chrome resources are already up-to-date.");
    }
    Ok(())
}

/**
 * Checks if Chrome and ChromeDriver binaries exist at expected paths
 * 
 * @param {&ConnectInfo} connect_info - Connection information for path generation
 * @returns {bool} True if any required files are missing
 */
fn check_for_invalid_paths(connect_info: &ConnectInfo) -> bool {
    let driver_path = get_chromedriver_path(connect_info);
    let binary_path = get_chromebinary_path(connect_info);
    !driver_path.exists() || !binary_path.exists()
}

/**
 * Sets executable permissions on Unix-like systems
 * Required for ChromeDriver to be executable after extraction
 * 
 * @param {&PathBuf} path - Path to the file to make executable
 * @returns {Result<(), anyhow::Error>} Success or error result
 * @throws {anyhow::Error} If permission setting fails
 */
#[cfg(unix)]
fn set_executable(path: &PathBuf) -> Result<(), anyhow::Error> {
    fs::set_permissions(path, fs::Permissions::from_mode(0o755))?;
    Ok(())
}

/**
 * No-op function for Windows (executable permissions not needed)
 * 
 * @param {&PathBuf} _ - Unused path parameter
 * @returns {Result<(), anyhow::Error>} Always succeeds
 */
#[cfg(windows)]
fn set_executable(_: &PathBuf) -> Result<(), anyhow::Error> {
    Ok(())
}

/**
 * Downloads and installs Chrome browser and ChromeDriver binaries
 * 
 * This function:
 * 1. Cleans up old resources directory
 * 2. Downloads Chrome and ChromeDriver ZIP files for the target OS
 * 3. Extracts the archives to the resources directory
 * 4. Sets executable permissions where needed
 * 5. Cleans up temporary ZIP files
 * 
 * @param {&ConnectInfo} connect_info - Connection info with version and OS details
 * @returns {Result<(), anyhow::Error>} Success or error result
 * @throws {anyhow::Error} If download, extraction, or file operations fail
 */
async fn setup_chrome_and_driver(connect_info: &ConnectInfo) -> Result<(), anyhow::Error> {
    println!("Updating Chrome resources...");
    fs::remove_dir_all(RESOURCES_DIR).ok(); // Clean-up old resources
    let resources_path = ensure_resources_dir()?;
    let downloader = Downloader::new();

    // Download and extract Chrome browser
    let chrome_zip = resources_path.join(format!("chrome-{}.zip", connect_info.os));
    let chrome_url = format!("{}/{}/{}/chrome-{}.zip", CHROME_URL, connect_info.version, connect_info.os, connect_info.os);
    downloader.download_to_file(&chrome_url, &chrome_zip).await?;
    downloader.extract_zip(&chrome_zip, &resources_path)?;
    fs::remove_file(chrome_zip)?;

    // Download and extract ChromeDriver
    let driver_zip = resources_path.join(format!("chromedriver-{}.zip", connect_info.os));
    let driver_url = format!("{}/{}/{}/chromedriver-{}.zip", CHROME_URL, connect_info.version, connect_info.os, connect_info.os);
    downloader.download_to_file(&driver_url, &driver_zip).await?;
    downloader.extract_zip(&driver_zip, &resources_path)?;
    set_executable(&get_chromedriver_path(connect_info))?;
    fs::remove_file(driver_zip)?;

    Ok(())
}

/**
 * Constructs the path to the ChromeDriver executable
 * Handles OS-specific path differences and file extensions
 * 
 * @param {&ConnectInfo} connect_info - Connection info containing OS information
 * @returns {PathBuf} Full path to ChromeDriver executable
 */
fn get_chromedriver_path(connect_info: &ConnectInfo) -> PathBuf {
    let mut path = std::env::current_dir().expect("Failed to get current directory");
    path.push(RESOURCES_DIR);
    let os_folder = format!("chromedriver-{}", connect_info.os);
    path.push(os_folder);
    path.push("chromedriver");

    if cfg!(target_os = "windows") {
        path.set_extension("exe");
    }
    path
}

/**
 * Constructs the path to the Chrome browser executable
 * Handles OS-specific directory structures and executable locations
 * 
 * @param {&ConnectInfo} connect_info - Connection info containing OS information
 * @returns {PathBuf} Full path to Chrome browser executable
 * @throws {panic} If running on unsupported operating system
 */
fn get_chromebinary_path(connect_info: &ConnectInfo) -> PathBuf {
    let mut path_buf = std::env::current_dir().expect("Failed to get current directory")
        .join(RESOURCES_DIR)
        .join(format!("chrome-{}", connect_info.os));

    match env::consts::OS {
        "macos" => {
            path_buf.push("Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
        },
        "windows" => {
            path_buf.push("chrome.exe");
        },
        "linux" => {
            path_buf.push("chrome");
        },
        _ => panic!("Unsupported operating system"),
    }
    path_buf
}

/**
 * Ensures the resources directory exists, creating it if necessary
 * 
 * @returns {Result<PathBuf, anyhow::Error>} Path to resources directory or error
 * @throws {anyhow::Error} If directory creation fails
 */
fn ensure_resources_dir() -> Result<PathBuf, anyhow::Error> {
    let resources_path = std::env::current_dir()?.join(RESOURCES_DIR);
    if !resources_path.exists() {
        fs::create_dir_all(&resources_path)?;
    }
    Ok(resources_path)
}