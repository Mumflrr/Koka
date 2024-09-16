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
const CHROMEDRIVER_URL: &str = "https://chromedriver.storage.googleapis.com/114.0.5735.90/chromedriver_linux64.zip";

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command 
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn get_chromedriver_path() -> PathBuf {
    let mut path = std::env::current_dir().expect("Failed to get current directory");
    path.pop(); // Go up one directory
    path.push("resources");
    path.push("chromedriver");
    if cfg!(target_os = "windows") {
        path.set_extension("exe");
    }
    path
}

fn chromedriver_setup() -> Result<(), Box<dyn std::error::Error>> {
    // Get chrome driver path (if exists)
    let chromedriver_path = get_chromedriver_path();

    // Check if ChromeDriver is installed
    if !chromedriver_path.exists() {
        println!("ChromeDriver not found. Installing...");
        let resources_path = chromedriver_path.parent().unwrap().to_path_buf();

        // Download ChromeDriver
        let response = get(CHROMEDRIVER_URL)?;
        let mut file = File::create(resources_path.join("chromedriver.zip"))?;
        copy(&mut response.bytes()?.as_ref(), &mut file)?;

        // Extract ChromeDriver
        let zip_file = File::open(resources_path.join("chromedriver.zip"))?;
        let mut archive = ZipArchive::new(BufReader::new(zip_file))?;

        archive.extract(resources_path)?;

    } else {
        println!("ChromeDriver is already installed.");
    }

    Ok(())
}

#[tauri::command]
async fn check_scrape() -> String {
    match perform_scrape().await {
        Ok(()) => String::from("Success!"),
        Err(error) => format!("{}", error),
    }
}

/// Performs the backend scraping
async fn perform_scrape() -> Result<(), /* GetElementError */Box<dyn std::error::Error>> {
    /* let website_urls : [&str; 5] = ["https://dining.ncsu.edu/location/clark/", "https://dining.ncsu.edu/location/fountain/",
                                "https://dining.ncsu.edu/location/case/", "https://dining.ncsu.edu/location/university-towers/",
                                "https://dining.ncsu.edu/location/one-earth/"];
     */

    // Start ChromeDriver
    let _chromedriver = Command::new(get_chromedriver_path()).arg("--port=9515").spawn().map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

    // Set up WebDriver
    let caps = DesiredCapabilities::chrome();
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
    match chromedriver_setup() {
        Ok(()) => println!("ChromeDriver is setup!"),
        Err(err) => println!("{}", err),
    };

    //tauri::async_runtime::block_on(async {
    //    println!("Test: {}", check_scrape().await);
    //    println!("Complete!");
    //});
    //println!("Complete pt 2");

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet, check_scrape])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    
}
