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

const RESOURCES_DIR: &str = "resources";
const CHROME_URL: &str = "https://storage.googleapis.com/chrome-for-testing-public";

struct Downloader {
    client: Client,
}

impl Downloader {
    fn new() -> Self {
        Self { client: Client::new() }
    }

    async fn download_to_file(&self, url: &str, output_path: &PathBuf) -> Result<(), anyhow::Error> {
        let response = self.client.get(url).send().await?.error_for_status()?;
        let mut file = File::create(output_path)?;
        copy(&mut response.bytes().await?.as_ref(), &mut file)?;
        Ok(())
    }

    fn extract_zip(&self, zip_path: &PathBuf, extract_dir: &PathBuf) -> Result<(), anyhow::Error> {
        let zip_file = File::open(zip_path)?;
        let mut archive = ZipArchive::new(BufReader::new(zip_file))?;
        archive.extract(extract_dir)?;
        Ok(())
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct LatestVersion {
    timestamp: String,
    channels: HashMap<String, Channel>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Channel {
    channel: String,
    version: String,
    revision: String,
}

// PUBLIC FUNCTIONS (only 2 needed)

/// Main setup function that orchestrates the entire Chrome setup process
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

/// Start ChromeDriver for web scraping operations
pub async fn start_chromedriver(connect_info: &ConnectInfo) -> Result<WebDriver, anyhow::Error> {
    quit_chromedriver()?;
    let mut caps = DesiredCapabilities::chrome();
    let binary_path = get_chromebinary_path(connect_info);
    caps.set_binary(&binary_path.to_string_lossy()).context("Unable to set binary path")?;

    let driver_path = get_chromedriver_path(connect_info);
    Command::new(&driver_path)
        .args(["--port=9515", "--verbose", "--log-path=chromedriver.log"])
        .spawn()
        .with_context(|| format!("Failed to start chromedriver from path: {:?}", driver_path))?;
    
    for _ in 0..10 {
        if TcpStream::connect("localhost:9515").is_ok() {
            println!("ChromeDriver is running on port 9515.");
            return WebDriver::new("http://localhost:9515", caps).await.map_err(Into::into);
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }

    Err(anyhow::anyhow!("ChromeDriver did not start on port 9515 in time."))
}

// PRIVATE FUNCTIONS (internal use only)

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

async fn sync_chrome_resources(connect_info: &ConnectInfo, needs_update: bool) -> Result<(), anyhow::Error> {
    if needs_update || check_for_invalid_paths(connect_info) {
        setup_chrome_and_driver(connect_info).await?;
        println!("Chrome resources are now up-to-date.");
    } else {
        println!("Chrome resources are already up-to-date.");
    }
    Ok(())
}

fn check_for_invalid_paths(connect_info: &ConnectInfo) -> bool {
    let driver_path = get_chromedriver_path(connect_info);
    let binary_path = get_chromebinary_path(connect_info);
    !driver_path.exists() || !binary_path.exists()
}

#[cfg(unix)]
fn set_executable(path: &PathBuf) -> Result<(), anyhow::Error> {
    fs::set_permissions(path, fs::Permissions::from_mode(0o755))?;
    Ok(())
}

#[cfg(windows)]
fn set_executable(_: &PathBuf) -> Result<(), anyhow::Error> {
    Ok(())
}

async fn setup_chrome_and_driver(connect_info: &ConnectInfo) -> Result<(), anyhow::Error> {
    println!("Updating Chrome resources...");
    fs::remove_dir_all(RESOURCES_DIR).ok(); // Clean-up old resources
    let resources_path = ensure_resources_dir()?;
    let downloader = Downloader::new();

    let chrome_zip = resources_path.join(format!("chrome-{}.zip", connect_info.os));
    let chrome_url = format!("{}/{}/{}/chrome-{}.zip", CHROME_URL, connect_info.version, connect_info.os, connect_info.os);
    downloader.download_to_file(&chrome_url, &chrome_zip).await?;
    downloader.extract_zip(&chrome_zip, &resources_path)?;
    fs::remove_file(chrome_zip)?;

    let driver_zip = resources_path.join(format!("chromedriver-{}.zip", connect_info.os));
    let driver_url = format!("{}/{}/{}/chromedriver-{}.zip", CHROME_URL, connect_info.version, connect_info.os, connect_info.os);
    downloader.download_to_file(&driver_url, &driver_zip).await?;
    downloader.extract_zip(&driver_zip, &resources_path)?;
    set_executable(&get_chromedriver_path(connect_info))?;
    fs::remove_file(driver_zip)?;

    Ok(())
}

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

fn ensure_resources_dir() -> Result<PathBuf, anyhow::Error> {
    let resources_path = std::env::current_dir()?.join(RESOURCES_DIR);
    if !resources_path.exists() {
        fs::create_dir_all(&resources_path)?;
    }
    Ok(resources_path)
}