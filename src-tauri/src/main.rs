// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod program_setup;
mod tauri_commands;

mod helper_functions;

use program_setup::*;
use tauri_commands::*;

use serde::{Serialize, Deserialize};
use std::process::Command;
use std::env;
use std::sync::Arc;
use std::sync::Mutex;
use std::thread;
use anyhow::{Context, Result};
//use rusqlite::{Connection, Result};


// Assuming CONNECTINFO is defined elsewhere
struct AppState {
    connect_info: Arc<Mutex<CONNECTINFO>>,
}

// Define the ChromeDriver version and URL
#[derive(Debug, Serialize, Deserialize)]
struct CONNECTINFO {
    chromedriver_url: String,
    os_url: String,
    version: String,
}


// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command 
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}


#[tauri::command]
fn start_scrape(state: tauri::State<'_, AppState>, window: tauri::Window) -> Result<(), String> {
    // Clone the Arc<Mutex<ConnectInfo>> instead of the ConnectInfo itself
    let connect_info = Arc::clone(&state.connect_info);
    
    thread::spawn(move || {
        // Create a new runtime for this thread
        let rt = tokio::runtime::Runtime::new().expect("Failed to create runtime");

        // Use the runtime to run our async function
        let result = rt.block_on(async {
            // Acquire the lock inside the async block
            let connect_info = match connect_info.lock() {
                Ok(guard) => guard,
                Err(e) => return Some(format!("Failed to acquire lock: {}", e)),
            };
            
            scrape_schedule(&connect_info).await
        });

        // Send the result back to the main thread
        let _ = window.emit("scrape_result", &result);
    });

    Ok(())
}


fn main() {
    // Ensure chrome driver is, in fact, not running when the file is run
    let _ = quit_chromedriver();
    // Enable backtracing
    env::set_var("RUST_BACKTRACE", "1");

    // Setup the struct for downloading and installing chromedriver and chrome
    let connection_struct = match setup_program() {
        Ok(setup_struct) => setup_struct,
        Err(err) => {
            eprintln!("Error during program setup: {}", err);
            std::process::exit(1);
        },
    };
    
    println!("Program setup complete!");

    tauri::Builder::default()
        .setup(|app| {
            // Perform any additional setup here if needed
            Ok(())
        })
        .manage(AppState {
            connect_info: Arc::new(Mutex::new(connection_struct)),
        })
        .invoke_handler(tauri::generate_handler![greet, start_scrape])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}