// Dependency is only able to be loaded on unix systems
#[cfg(not(target_os = "windows"))] 
    use std::os::unix::fs::PermissionsExt;
use std::{env, fs::{self, File}, io::{copy, BufReader}, net::TcpStream, path::PathBuf, process::Command};
use reqwest::blocking::get;
use thirtyfour::{ChromiumLikeCapabilities, DesiredCapabilities, WebDriver};
use zip::ZipArchive;

use crate::ConnectInfo;

// Get path of chromedriver
pub fn get_chromedriver_path() -> PathBuf {
    let mut path = std::env::current_dir().expect("Failed to get current directory");
    path.push("resources");
    path.push("chromedriver");
    if cfg!(target_os = "windows") {
        path.set_extension("exe");
    }
    path
}

// Get version of chromedriver/chrome to use from the lastest version of chromedriver available
// since that is the limting factor between the two
fn get_version(connect_info: &mut ConnectInfo) -> Result<(), anyhow::Error> {
    let url = format!("{}LATEST_RELEASE", connect_info.chromedriver_url.as_str());
    let client = reqwest::blocking::Client::new();

    connect_info.version =  client.get(url).send()?.text()?;

    Ok(())
}

// Setup chrome binary
fn chrome_binary_setup(connect_info: &ConnectInfo) -> Result<(), anyhow::Error> {
    // Install @puppeteer/browsers
    let pnpm_command = if cfg!(target_os = "windows") { "pnpm.cmd" } else { "pnpm" };
    Command::new(pnpm_command)
        .args(&["add", "-g", "@puppeteer/browsers@2.4.0"])
        .output()?;

    println!("@puppeteer/browsers@2.4.0 installed successfully");

    // Get directory to install chrome
    let mut chrome_path = std::env::current_dir().expect("Failed to get current directory");
    chrome_path.push("resources");

    // Install Chrome to the specified path
    Command::new(pnpm_command)
        .args(&[
            "dlx",
            "@puppeteer/browsers",
            "install",
            &format!("chrome@{}", connect_info.version),
            "--path",
            chrome_path.to_str().unwrap(),
        ])
        .output()?;


    // Change permission if on a unix system (may have to revisit for windows)
    #[cfg(unix)] {
        let path_buf = get_chrome_binary_path(connect_info);

        // Get the current file metadata
        let metadata = fs::metadata(&path_buf)?;
    
        // Get the current permissions
        let mut permissions = metadata.permissions();

        // Set the permission to be executable by the owner (u+x)
        // This sets the permission bits to 0o755 (read, write, and execute for the owner, and read+execute for others)
        permissions.set_mode(0o755);

        // Apply the new permissions to the file or directory
        fs::set_permissions(&path_buf, permissions)?;
    }

    Ok(())
}

// Setup chromedriver and chrome if needed
pub fn chrome_setup(connect_info: &mut ConnectInfo) -> Result<(), anyhow::Error> {
    // Get chrome driver path (if exists)
    let chromedriver_path = get_chromedriver_path();

    // Check if ChromeDriver is installed
    if !chromedriver_path.exists() {
        println!("ChromeDriver not found. Installing...");
        let resources_path = chromedriver_path.parent().unwrap().to_path_buf();

        // Get latest chrome driver version
        get_version(connect_info)?;

        // Make url to download chromedriver
        let download_url = format!("{}{}{}", connect_info.chromedriver_url.as_str(), connect_info.version, connect_info.os_url.as_str());
        // Get data
        let response = get(download_url)?;
        // Make a file to chromedriver zip
        let mut file = File::create(resources_path.join("chromedriver.zip"))?;
        // Copy data from chromedriver as chromedriver zip
        copy(&mut response.bytes()?.as_ref(), &mut file)?;

        // Extract ChromeDriver
        let zip_file = File::open(resources_path.join("chromedriver.zip"))?;
        let mut archive = ZipArchive::new(BufReader::new(zip_file))?;
        archive.extract(resources_path)?;

        // Since chromedriver had to be setup, also setup chrome
        chrome_binary_setup(connect_info)?;

        println!("Chromium setup!");

        Ok(())

    } else {
        println!("Chromium already setup!");
        get_version(connect_info)?;
        Ok(())
    }

}


pub async fn start_chromedriver(connect_info: &ConnectInfo) -> Result<WebDriver, Box<dyn std::error::Error>> {
    // Set up WebDriver
    let mut caps = DesiredCapabilities::chrome();
    let path_buf = get_chrome_binary_path(connect_info);
    let path = format!("{}", path_buf.display());

    caps.set_binary(&path)?;

    // Start ChromeDriver exe
    let _chromedriver = Command::new(get_chromedriver_path())
    .arg("--port=9515")
    .arg("--verbose")
    .arg("--log-path=chromedriver.log")
    .spawn()
    .map_err(|e| Box::new(e) as Box<dyn std::error::Error>);

    // Wait for ChromeDriver to start and be accessible
    let max_retries = 5;
    for _ in 0..max_retries {
        if TcpStream::connect("localhost:9515").is_ok() {
            println!("ChromeDriver is running on port 9515");
            break;
        } else {
            println!("Waiting for ChromeDriver to start...");
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        }
    }

    // Make new webdrier session at localhost:9515
    let driver = WebDriver::new("http://localhost:9515", caps).await
        .map_err(|e| {
            eprintln!("WebDriver error: {:?}", e);
            e
    });

    // Error catching
    match driver {
        Ok(_) => return Ok(driver.unwrap()),
        Err(err) => panic!("Error: {}", err),
    };
}

// Get the path of the chrome binary
pub fn get_chrome_binary_path(connect_info: &ConnectInfo) -> PathBuf {
    // Set the path to chrome folder
    let mut path_buf = std::env::current_dir().expect("Failed to get current directory");
    path_buf.push("resources");
    path_buf.push("chrome");

    // Find chromium binary folder inside of chrome folder for our version
    let paths = fs::read_dir(&path_buf).unwrap();
    let mut name = String::from("");
    for path in paths {
        name = format!("{}", path.unwrap().path().display());
        if name.contains(&connect_info.version) {
            break;
        }
    }
    path_buf.push(&name);

    // There should be only one folder in this folder, so get it too
    let paths = fs::read_dir(&path_buf).unwrap();
    for path in paths {
        name = format!("{}", path.unwrap().path().display());
    }
    path_buf.push(&name);

    // Cross-platform compatibility since different os will have different path endings
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

    path_buf
}