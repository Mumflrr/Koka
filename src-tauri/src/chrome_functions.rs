#[cfg(not(target_os = "windows"))] 
use std::os::unix::fs::PermissionsExt;
use std::{collections::HashMap, env, fs::{self, File}, io::{copy, BufReader}, net::TcpStream, path::PathBuf, process::Command};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use thirtyfour::{ChromiumLikeCapabilities, DesiredCapabilities, WebDriver};
use zip::ZipArchive;
use anyhow::Context;
use rusqlite::{params, Connection, Result};

use crate::ConnectInfo;

// Make sure chromedriver is not running (for windows machine)
#[cfg(target_os = "windows")]
pub fn quit_chromedriver() -> Result<(), Box<dyn std::error::Error>> {
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

pub fn get_version(connect_info: &mut ConnectInfo) -> Result<String, anyhow::Error> {
    // Save old version to return
    let old_version = connect_info.version.clone();

    // Connect to api to find last known good version
    let client = Client::new();
    let url = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json";
    
    // Get the JSON response
    let response: LatestVersion = client.get(url)
        .send()?
        .json()?;

    // Store response in atomic struct
    connect_info.version = response.channels.get("Stable").unwrap().version.clone();

    // Update the database with the current version
    let conn = Connection::open("programData.db")?;
    conn.execute("UPDATE data SET version = ?1 WHERE id = 0", params![connect_info.version])?;

    // Return old version
    Ok(old_version)
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


fn chromebinary_setup(connect_info: &mut ConnectInfo) -> Result<(), anyhow::Error> {
    let client = Client::new();

    // Create resources directory and construct paths
    let resources_path = std::env::current_dir()?
        .join("resources");

    // Construct download URL
    let download_url = format!(
        "https://storage.googleapis.com/chrome-for-testing-public/{}/{}/chrome-{}.zip",
        connect_info.version,
        connect_info.os,
        connect_info.os
    );
    println!("Downloading Chrome from: {}", download_url);

    // Get response from website
    let response = client.get(&download_url)
        .send()
        .context("CB Setup: Failed to download")?;

    // Construct filename and add it to path to downlaod
    let filename = format!("chrome-{}.zip", connect_info.os);
    // Create zip file to save response into
    let zip_path = resources_path.join(&filename);
    let mut output_file = File::create(&zip_path)?;
    
    // Copy response into the output zip file
    copy(
        &mut response.bytes().context("CB Setup: Failed to get response bytes")?.as_ref(),
        &mut output_file
    )?;

    // Open the zip file
    let zip_file = File::open(&zip_path)?;
    // Extract the zip file
    let mut archive = ZipArchive::new(BufReader::new(zip_file))?;
    archive.extract(&resources_path)?;

    // Clean up the zip file
    fs::remove_file(zip_path)?;
    Ok(())
}

fn chromedriver_setup(connect_info: &mut ConnectInfo) -> Result<(), anyhow::Error> {   
    let client = Client::new();

    // Create resources directory and construct paths
    let resources_path = std::env::current_dir()?
        .join("resources");

    // Construct download URL
    let download_url = format!(
        "https://storage.googleapis.com/chrome-for-testing-public/{}/{}/chromedriver-{}.zip",
        connect_info.version,
        connect_info.os,
        connect_info.os
    );
    println!("Downloading ChromeDriver from: {}", download_url);

    // Get response from website
    let response = client.get(&download_url)
        .send()
        .context("CD Setup: Failed to download")?;
    
    // Construct filename and add it to path to downlaod
    let filename = format!("chromedriver-{}.zip", connect_info.os);
    // Create zip file to save response into
    let zip_path = resources_path.join(&filename);

    let mut output_file = File::create(&zip_path)?;
    
    // Copy response into the output zip file
    copy(
        &mut response.bytes().context("CD Setup: Failed to get response bytes")?.as_ref(),
        &mut output_file
    )?;

    // Open the zip file
    let zip_file = File::open(&zip_path)?;
    // Extract the zip file
    let mut archive = ZipArchive::new(BufReader::new(zip_file))?;
    archive.extract(&resources_path)?;

    // Set executable permissions on Unix systems
    #[cfg(unix)] {
        let binary_path = get_chromedriver_path(connect_info);
        fs::set_permissions(&binary_path, fs::Permissions::from_mode(0o755))?;
    }

    // Clean up the zip file
    fs::remove_file(zip_path)?;

    Ok(())
}
    

pub fn chrome_setup(connect_info: &mut ConnectInfo) -> Result<(), anyhow::Error> {
    // Create resources directory and construct paths
    let file_path = std::env::current_dir()?
        .join("resources");

    // Check if filepath exists
    match file_path.try_exists() {
        Ok(exists) => {
            if exists { // If it exists check if versions need to be updated
                println!("Resources directory already exists");
                println!("Previous version: {}, new version: {}", get_version(connect_info).unwrap(), connect_info.version);
                if get_version(connect_info).unwrap() != connect_info.version {
                    // If we need to update then remove directory, create it, and re-setup cd + binary
                    println!("Updating existing resources...");
                    
                    fs::remove_dir_all(file_path.clone())?;
                    fs::create_dir_all(file_path.clone())?;
                    
                    chromedriver_setup(connect_info)?;
                    chromebinary_setup(connect_info)?;
                }
            } else { // If it doesn't already exists, then we need to setup chromedriver + binary
                println!("Creating resources directory...");
                fs::create_dir_all(&file_path)?;
                
                chromedriver_setup(connect_info)?;
                println!("ChromeDriver setup complete");
                
                chromebinary_setup(connect_info)?;
                println!("Chromium setup complete");
            }
        },
        Err(e) => { // Failed to determine if file path exists or not
            return Err(anyhow::anyhow!("Failed to check if resources directory exists: {}", e));
        }
    }

    // Check install was valid
    let files = fs::read_dir(file_path.clone()).unwrap();
    for file in files {
        if file.as_ref().unwrap().path().is_dir() || file.unwrap().path().extension().unwrap().to_str().unwrap() == ".DS_Store" {
            continue;
        }
        println!("Resources are corrupted; attempting reinstall");
        fs::remove_dir_all(file_path.clone())?;
        fs::create_dir_all(file_path.clone())?;
                    
        chromedriver_setup(connect_info)?;
        chromebinary_setup(connect_info)?;

        return Err(anyhow::anyhow!("Unable to setup resources"));
    }

    Ok(())
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
