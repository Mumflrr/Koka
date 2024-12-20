#[cfg(not(target_os = "windows"))] 
use std::os::unix::fs::PermissionsExt;
use std::{collections::HashMap, env, fs::{self, File}, io::{copy, BufReader}, net::TcpStream, path::PathBuf, process::Command, time::Duration};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use thirtyfour::{ChromiumLikeCapabilities, DesiredCapabilities, WebDriver};
use zip::ZipArchive;
use anyhow::Context;
use rusqlite::Result;
use crate::{database_functions::update_db_version, ConnectInfo};

const RESOURCES_DIR: &str = "resources";
const CHROME_URL: &str = "https://storage.googleapis.com/chrome-for-testing-public";

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

struct Downloader {
    client: Client,
}

// Struct to read in the latest version from JSON
#[derive(Debug, Serialize, Deserialize)]
struct LatestVersion {
    timestamp: String,
    channels: HashMap<String, Channel>,
}

// Struct to read in channel info from JSON
#[derive(Debug, Serialize, Deserialize)]
struct Channel {
    channel: String,
    version: String,
    revision: String,
}

// Make sure chromedriver is not running (for windows machine)
#[cfg(target_os = "windows")]
pub fn quit_chromedriver() -> Result<(), anyhow::Error> {
    let output = Command::new("tasklist")
        .args(&["/FI", "IMAGENAME eq chromedriver.exe", "/FO", "CSV", "/NH"])
        .output()?;

    let output_str = String::from_utf8(output.stdout)?;
    
    if output_str.contains("chromedriver.exe") {
        println!("Chromedriver processes found. Terminating...");
        let kill_output = Command::new("taskkill")
            .args(&["/F", "/IM", "chromedriver.exe"])
            .output()?;

        if kill_output.status.success() {
            println!("All chromedriver processes have been terminated.");
        } else {
            let error_message = String::from_utf8(kill_output.stderr)?;
            return Err(anyhow::anyhow!("Failed to terminate ChromDriver: {}", error_message));
        }
    } else {
        println!("No chromedriver processes found.");
    }

    Ok(())
}

// Make sure chromedriver is not running (for macos and linux machines)
#[cfg(any(target_os = "macos", target_os = "linux"))]
pub fn quit_chromedriver() -> Result<(), anyhow::Error> {
    let output = Command::new("pgrep")
        .arg("chromedriver")
        .output()?;

    if !output.stdout.is_empty() {
        println!("Chromedriver processes found. Terminating...");
        let kill_output = Command::new("pkill")
            .arg("chromedriver")
            .output()?;

        if kill_output.status.success() {
            println!("All chromedriver processes have been terminated.");
        } else {
            let error_message = String::from_utf8(kill_output.stderr)?;
            return Err(anyhow::anyhow!("Failed to terminate ChromDriver: {}", error_message));
        }
    } else {
        println!("No chromedriver processes found to kill.");
    }

    Ok(())
}

async fn setup_chrome_and_driver(connect_info: &ConnectInfo) -> Result<(), anyhow::Error> {
    println!("Updating Chrome resources");
    fs::remove_dir_all(RESOURCES_DIR).ok(); // Clean-up
    
    let resources_path = ensure_resources_dir()?;
    let downloader = Downloader::new();

    // Chrome Binary
    let chrome_zip = resources_path.join(format!("chrome-{}.zip", connect_info.os));
    let chrome_url = format!("{}/{}/{}/chrome-{}.zip", CHROME_URL, connect_info.version, connect_info.os, connect_info.os);

    downloader.download_to_file(&chrome_url, &chrome_zip).await?;
    downloader.extract_zip(&chrome_zip, &resources_path)?;
    fs::remove_file(chrome_zip)?;

    // ChromeDriver
    let driver_zip = resources_path.join(format!("chromedriver-{}.zip", connect_info.os));
    let driver_url = format!("{}/{}/{}/chromedriver-{}.zip", CHROME_URL, connect_info.version, connect_info.os, connect_info.os);

    downloader.download_to_file(&driver_url, &driver_zip).await?;
    downloader.extract_zip(&driver_zip, &resources_path)?;
    set_executable(&resources_path.join(format!("chromedriver-{}", connect_info.os)))?;
    fs::remove_file(driver_zip)?;

    Ok(())
}

// Main function to check and update Chrome version
pub async fn get_version(connect_info: &mut ConnectInfo) -> Result<String, anyhow::Error> {
    // Store the current version to return later (for tracking changes)
    let old_version = connect_info.version.clone();

    // Create an HTTP client with reasonable timeout settings
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;
    
    // URL for Chrome's version information
    let url = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json";
    
    // Fetch and parse the version information
    let response: LatestVersion = client
        .get(url)
        .send().await?  // Wait for the HTTP request to complete
        .json().await?; // Wait for JSON parsing to complete

    // Extract the stable version from the response
    let new_version = response
        .channels
        .get("Stable")
        .ok_or_else(|| anyhow::anyhow!("Stable channel not found"))?
        .version
        .clone();

    // Update the ConnectInfo structure with the new version
    connect_info.version = new_version.clone();

    // Update the database with the new version
    update_db_version(new_version).await?;

    // Return the old version (useful for detecting changes)
    Ok(old_version)
}


pub async fn chrome_update_check(connect_info: &mut ConnectInfo) -> Result<(), anyhow::Error> {
    let old_version = get_version(connect_info).await?;
    if old_version != connect_info.version {
        setup_chrome_and_driver(connect_info).await?;
    } else if check_invalid_paths(connect_info) {
        setup_chrome_and_driver(connect_info).await?;
    }

    println!("Chrome resources are up-to-date.");
    Ok(())
}

pub fn check_invalid_paths(connect_info: &mut ConnectInfo) -> bool {
    let driver_path = get_chromedriver_path(connect_info);
    let binary_path = get_chromebinary_path(connect_info);

    return !driver_path.exists() || !binary_path.exists()
}

pub async fn start_chromedriver(connect_info: &ConnectInfo) -> Result<WebDriver, anyhow::Error> {
    // Get path to chromedriver exe and set path to that binary
    quit_chromedriver()?;
    
    let mut caps = DesiredCapabilities::chrome();
    let path_buf = get_chromebinary_path(connect_info);
    caps.set_binary(&path_buf.to_string_lossy()).context("Unable to set binary")?;

    // Start chromedriver
    let _chromedriver = Command::new(get_chromedriver_path(connect_info))
        .args(["--port=9515", "--verbose", "--log-path=chromedriver.log"])
        .spawn()
        .map_err(|e| anyhow::Error::new(e) as anyhow::Error).context("Unable to start CD")?;

    // Keep checking to see if chromedriver has started running
    for _ in 0..5 {
        if TcpStream::connect("localhost:9515").is_ok() {
            println!("ChromeDriver is running on port 9515");
            break;
        }
        println!("Waiting for ChromeDriver to start...");
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    }

    // Start running webdriver on port 9515 that connects to chromedriver
    WebDriver::new("http://localhost:9515", caps).await
        .map_err(|e| {
            eprintln!("WebDriver error: {:?}", e);
            anyhow::Error::new(e) as anyhow::Error
        })
}

#[cfg(unix)]
fn set_executable(path: &PathBuf) -> Result<(), anyhow::Error> {
    fs::set_permissions(path, fs::Permissions::from_mode(0o755))?;
    Ok(())
}
#[cfg(windows)]
fn set_executable(_: &PathBuf) -> Result<(), anyhow::Error> {
    Ok(()) // No-op for Windows
}

fn get_chromedriver_path(connect_info: &ConnectInfo) -> PathBuf {
    // Get current directory and naviagte to chromedriver folder
    let mut path = std::env::current_dir().expect("Failed to get current directory");
    path.push("resources");
    path.push(format!("chromedriver-{}", connect_info.os));
    path.push("chromedriver");

    // If windows then add exe extension
    if cfg!(target_os = "windows") {
        path.set_extension("exe");
    }

    // Return filepath
    path
}

fn get_chromebinary_path(connect_info: &ConnectInfo) -> PathBuf {
    // Get current directory and navigate to chrome binary folder
    let mut path_buf = std::env::current_dir().expect("Failed to get current directory")
        .join("resources")
        .join(format!("chrome-{}", connect_info.os));

    // Depending on os additional file path steps may be needed to get to the binary exe
    match env::consts::OS {
        "macos" => {
            path_buf.push("Google Chrome for Testing.app");
            path_buf.push("Contents");
            path_buf.push("MacOS");
            path_buf.push("Google Chrome for Testing");
        },
        "windows" => {
            path_buf.push("chrome.exe");
        },
        "linux" => {
            path_buf.push("chrome");
        },
        _ => panic!("Unsupported operating system"),
    }

    // Return filepath
    path_buf
}

fn ensure_resources_dir() -> Result<PathBuf, anyhow::Error> {
    let resources_path = std::env::current_dir()?.join(RESOURCES_DIR);
    if !resources_path.exists() {
        fs::create_dir_all(&resources_path)?;
    }
    Ok(resources_path)
}
