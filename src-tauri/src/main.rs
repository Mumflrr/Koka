// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod custom_errors;
//use custom_errors::GetElementError;
use thirtyfour::prelude::*;
use std::env;
use std::path::PathBuf;
use std::process::Command;
use std::fs::File;
use std::io::copy;
use reqwest::blocking::get;
use std::io::BufReader;
use zip::ZipArchive;
//use tauri::async_runtime;
//use rusqlite::{Connection, Result};

// Define the ChromeDriver version and URL
enum URLS {
    ChromedriverUrl,
    LinuxUrl,
    MacOSUrl,
    WindowsUrl,
}

impl URLS {
    fn as_str(&self) -> &'static str {
        match self {
            URLS::ChromedriverUrl => "https://chromedriver.storage.googleapis.com/",
            URLS::LinuxUrl => "/chromedriver_linux64.zip",
            URLS::WindowsUrl => "/chromedriver_win32.zip",
            URLS::MacOSUrl => if cfg!(target_arch = "aarch64") {
                                "/chromedriver_mac_arm64.zip"
                            }
                            else {
                                "/chromedriver_mac64.zip"
                            },
        }
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

fn get_chromeiumbinary_path(version: String) -> PathBuf {
    let mut path = std::env::current_dir().expect("Failed to get current directory");
    path.push("resources");
    path.push("chrome");
    if cfg!(target_os = "windows") {
        path.set_extension("exe");
    }
    path
}


fn chromedriver_setup() -> Result<(String), Box<dyn std::error::Error>> {
    // Get chrome driver path (if exists)
    let chromedriver_path = get_chromedriver_path();
    let mut version = String::from("");

    // Check if ChromeDriver is installed
    if !chromedriver_path.exists() {
        println!("ChromeDriver not found. Installing...");
        let resources_path = chromedriver_path.parent().unwrap().to_path_buf();

        // Get latest chrome driver version
        let url = format!("{}LATEST_RELEASE", URLS::ChromedriverUrl.as_str());
        let client = reqwest::blocking::Client::new();
        version = client.get(url).send()?.text()?;

        // Download ChromeDriver for macOS ARM64
        let os = format!("{}", env::consts::OS);
        let download_url = match os.as_str() {
            "linux" => format!("{}{}{}", URLS::ChromedriverUrl.as_str(), version, URLS::LinuxUrl.as_str()),
            "macos" => format!("{}{}{}", URLS::ChromedriverUrl.as_str(), version, URLS::MacOSUrl.as_str()),
            "windows" => format!("{}{}{}", URLS::ChromedriverUrl.as_str(), version, URLS::WindowsUrl.as_str()),
            _ => panic!("UNSUPPORTED OS"),
        };

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
                format!("chrome@{}", version).as_str(),
                "--path",
                chrome_path.into_os_string().into_string().unwrap().as_str(),
            ])
            .output()?;

        if !chrome_output.status.success() {
            return Err(format!("Command failed: {:?}", String::from_utf8_lossy(&output.stderr)).into());
        }
        println!("Chrome for Testing installed successfully");

    } else {
        println!("ChromeDriver and Chromeium are already installed.");
    }

    Ok(version)
}

#[tauri::command]
async fn check_scrape(version: String) -> String {
    match perform_scrape(version).await {
        Ok(()) => String::from("Success!"),
        Err(error) => format!("{}", error),
    }
}

/// Performs the backend scraping
async fn perform_scrape(version: String) -> Result<(), /* GetElementError */Box<dyn std::error::Error>> {
    /* let website_urls : [&str; 5] = ["https://dining.ncsu.edu/location/clark/", "https://dining.ncsu.edu/location/fountain/",
                                "https://dining.ncsu.edu/location/case/", "https://dining.ncsu.edu/location/university-towers/",
                                "https://dining.ncsu.edu/location/one-earth/"];
     */

    // Start ChromeDriver
    let _chromedriver = Command::new(get_chromedriver_path()).arg("--port=9515").spawn().map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

    // Set up WebDriver
    let caps = DesiredCapabilities::chrome();

    // Set the path to your custom Chrome binary
    let path = get_chromeiumbinary_path(version: String);
    caps.set_binary(path);



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
    // Enable backtracing
    env::set_var("RUST_BACKTRACE", "1");

    // May move chrome driver install into a method called by front end so it can be monitored
    // by front end for update/install/setup tracking and progress bar, but for now it will be here
    // since I have no front end (that I understand well enough to use)
    let version = match chromedriver_setup() {
        Ok(string) => format!("{}", string),
        Err(err) => format!("{}", err),
    };

    tauri::async_runtime::block_on(async {
        println!("Test: {}", check_scrape(version).await);
        println!("Complete!");
    });
    println!("Complete pt 2");

/*     tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet, check_scrape])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
     */
}
