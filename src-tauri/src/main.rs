// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod custom_errors;
use thirtyfour::common::capabilities::chrome;
//use custom_errors::GetElementError;
use thirtyfour::prelude::*;
use std::env;
use std::process::Command;
use std::fs::File;
use std::io::copy;
use reqwest::blocking::get;
use std::io::BufReader;
use zip::ZipArchive;
use std::panic;
use std::fs;
use std::path::{Path, PathBuf};
use std::os::unix::fs::PermissionsExt;
use std::io::{self, ErrorKind};
//use tauri::async_runtime;
//use rusqlite::{Connection, Result};

use std::net::TcpStream;


// Define the ChromeDriver version and URL
struct URLS {
    chromedriver_url: String,
    os_url: String,
    version: String,
}

#[cfg(target_os = "macos")]
fn os_setup() -> URLS {
    let mut url_struct = setup_struct();
    url_struct.os_url = if cfg!(target_arch = "aarch64") {String::from("/chromedriver_mac_arm64.zip")} 
                                else {String::from("/chromedriver_mac64.zip")};

    return url_struct
}

#[cfg(target_os = "windows")]
fn os_setup() -> URLS {
    let mut url_struct = setup_struct();
    url_struct.os_url = String::from("/chromedriver_win32.zip");

    return url_struct
}

#[cfg(target_os = "linux")]
fn os_setup() -> URLS {
    let mut url_struct = setup_struct();
    url_struct.os_url = String::from("/chromedriver_linux64.zip");

    return url_struct
}

#[cfg(target_os = "windows")]
fn quit_chromedriver() -> Result<(), Box<dyn std::error::Error>> {
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
            return Err(format!("Failed to terminate chromedriver: {}", error_message).into());
        }
    } else {
        println!("No chromedriver processes found.");
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn quit_chromedriver() -> Result<(), Box<dyn std::error::Error>> {
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
            return Err(format!("Failed to terminate chromedriver: {}", error_message).into());
        }
    } else {
        println!("No chromedriver processes found.");
    }

    Ok(())
}

#[cfg(target_os = "linux")]
fn quit_chromedriver() -> Result<(), Box<dyn std::error::Error>> {
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
            return Err(format!("Failed to terminate chromedriver: {}", error_message).into());
        }
    } else {
        println!("No chromedriver processes found.");
    }

    Ok(())
}


fn setup_struct() -> URLS {
    URLS {
        chromedriver_url : String::from("https://chromedriver.storage.googleapis.com/"),
        os_url : String::from(""),
        version : String::from(""),
    }
}


// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command 
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn get_chromedriver_path() -> PathBuf {
    let mut path = std::env::current_dir().expect("Failed to get current directory");
    path.push("resources");
    path.push("chromedriver");
    if cfg!(target_os = "windows") {
        path.set_extension("exe");
    }
    path
}

fn get_version(url_struct: &mut URLS) -> Result<(), Box<dyn std::error::Error>> {
    let url = format!("{}LATEST_RELEASE", url_struct.chromedriver_url.as_str());
    let client = reqwest::blocking::Client::new();

    url_struct.version = client.get(url).send()?.text()?;

    Ok(())
}

fn chromedriver_setup(url_struct: &mut URLS) -> Result<(), Box<dyn std::error::Error>> {
    // Get chrome driver path (if exists)
    let chromedriver_path = get_chromedriver_path();

    // Check if ChromeDriver is installed
    if !chromedriver_path.exists() {
        println!("ChromeDriver not found. Installing...");
        let resources_path = chromedriver_path.parent().unwrap().to_path_buf();

        // Get latest chrome driver version
        let url = format!("{}LATEST_RELEASE", url_struct.chromedriver_url.as_str());
        let client = reqwest::blocking::Client::new();

        url_struct.version = client.get(url).send()?.text()?;

        let download_url = format!("{}{}{}", url_struct.chromedriver_url.as_str(), url_struct.version, url_struct.os_url.as_str());

        let response = get(download_url)?;
        let mut file = File::create(resources_path.join("chromedriver.zip"))?;
        copy(&mut response.bytes()?.as_ref(), &mut file)?;

        // Extract ChromeDriver
        let zip_file = File::open(resources_path.join("chromedriver.zip"))?;
        let mut archive = ZipArchive::new(BufReader::new(zip_file))?;

        archive.extract(resources_path)?;

        let output = Command::new("pnpm")
        .args(&["add", "-g", "@puppeteer/browsers@2.4.0"])
        .output()?;

        if !output.status.success() {
            return Err(format!("Command failed: {:?}", String::from_utf8_lossy(&output.stderr)).into());
        }

        println!("@puppeteer/browsers@2.4.0 installed successfully");

        let mut chrome_path = std::env::current_dir().expect("Failed to get current directory");
        chrome_path.push("resources");


        // Install Chrome to the specified path
        let chrome_output = Command::new("pnpm")
            .args(&[
                "dlx",
                "@puppeteer/browsers",
                "install",
                format!("chrome@{}", url_struct.version).as_str(),
                "--path",
                chrome_path.into_os_string().into_string().unwrap().as_str(),
            ])
            .output()?;

        if !chrome_output.status.success() {
            return Err(format!("Command failed: {:?}", String::from_utf8_lossy(&output.stderr)).into());
        }
        println!("Chrome for Testing installed successfully");

    } else {
        match get_version(url_struct) {
            Ok(()) => println!("ChromeDriver and Chromeium are already installed."),
            Err(_err) => panic!("Unable to setup ChromeDriver and Chromium"),
        };
    }

    Ok(())
}


#[tauri::command]
async fn check_scrape(url_struct: &URLS) -> Result<String, String> {
    match perform_scrape(&url_struct).await {
        Ok(()) => Ok(String::from("Success!")),
        Err(error) => Err(format!("{}", error)),
    }
}

/// Performs the backend scraping
async fn perform_scrape(url_struct: &URLS) -> Result<(), /* GetElementError */Box<dyn std::error::Error>> {
    /* let website_urls : [&str; 5] = ["https://dining.ncsu.edu/location/clark/", "https://dining.ncsu.edu/location/fountain/",
                                "https://dining.ncsu.edu/location/case/", "https://dining.ncsu.edu/location/university-towers/",
                                "https://dining.ncsu.edu/location/one-earth/"];
     */


    // Set up WebDriver
    let mut caps = DesiredCapabilities::chrome();

    // Set the path to your custom Chrome binary
    let mut pathBuf = std::env::current_dir().expect("Failed to get current directory");
    pathBuf.push("resources");
    pathBuf.push("chrome");

    // Find chromium binary folder
    let paths = fs::read_dir(&pathBuf).unwrap();
    let mut name = String::from("");
    for path in paths {
        name = format!("{}", path.unwrap().path().display());
        if name.contains(&url_struct.version) {
            break;
        }
    }
    pathBuf.push(&name);

    // There should be only one folder in this folder, so get it
    let paths = fs::read_dir(&pathBuf).unwrap();
    for path in paths {
        name = format!("{}", path.unwrap().path().display());
    }
    pathBuf.push(&name);
    pathBuf.push("Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

    let path = format!("{}", pathBuf.display());


    // Get the current file metadata
    let metadata = fs::metadata(&pathBuf)?;
    
    // Get the current permissions
    let mut permissions = metadata.permissions();
    
    // Set the permission to be executable by the owner (u+x)
    // This sets the permission bits to 0o755 (read, write, and execute for the owner, and read+execute for others)
    permissions.set_mode(0o755);
    
    // Apply the new permissions to the file or directory
    fs::set_permissions(&pathBuf, permissions)?;






    caps.set_binary(&path)?;

    // Start ChromeDriver
    let _chromedriver = Command::new(get_chromedriver_path())
    .arg("--port=9515")
    .arg("--verbose")
    .arg("--log-path=chromedriver.log")
    .spawn()
    .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

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





    let driver = WebDriver::new("http://localhost:9515", caps).await
        .map_err(|e| {
            eprintln!("WebDriver error: {:?}", e);
            e
    })?;

    // Navigate to https://wikipedia.org.
    driver.goto("https://wikipedia.org").await?;
    let elem_form = driver.find(By::Id("search-form")).await?;
                           
    // Find element from element.
    let elem_text = elem_form.find(By::Id("searchInput")).await?;
                           
    // Type in the search terms.
    elem_text.send_keys("selenium").await?;
                           
    // Click the search button.
    let elem_button = elem_form.find(By::Css("button[type='submit']")).await?;
    elem_button.click().await?;
                           
    // Look for header to implicitly wait for the page to load.
    driver.find(By::ClassName("firstHeading")).await?;
    assert_eq!(driver.title().await?, "Selenium - Wikipedia");
                               
    // Always explicitly close the browser.
    driver.quit().await?;
                           
    Ok(())
}


fn main() {
    let _ = quit_chromedriver();
    // Enable backtracing
    env::set_var("RUST_BACKTRACE", "1");
    let mut url_struct = os_setup();

    // May move chrome driver install into a method called by front end so it can be monitored
    // by front end for update/install/setup tracking and progress bar, but for now it will be here
    // since I have no front end (that I understand well enough to use)
    match chromedriver_setup(&mut url_struct) {
        Ok(()) => format!("{}", "Chromium / WebDriver setup!"),
        Err(_err) => panic!("Unable to setup Chromeium / WebDriver!"),
    };

    tauri::async_runtime::block_on(async {
        println!("{}", 
                                match check_scrape(&url_struct).await {
                                    Ok(msg) => msg,
                                    Err(msg) => msg,
                                });
    });

/*     tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet, check_scrape])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
     */
}
