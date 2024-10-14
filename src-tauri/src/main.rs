// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod program_setup;
mod tauri_command_backends;
mod chrome_functions;

use program_setup::*;
use tauri::Manager;
use tauri_command_backends::*;
use chrome_functions::*;

use serde::{Serialize, Deserialize};
use std::env;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::thread;
use anyhow::Result;


//Add splash screene
//Add custom menu items


// AppState to allow for this struct to be passed into functions via Tauri without needing 
// Global variable. Arc makes it read-only across threads, and mutex makes it writeable on
// one thread at a time. Acts like a singleton
struct AppState {
    connect_info: Arc<Mutex<ConnectInfo>>,
}

// ConnectInfo struct (only one should ever be instantiated)
#[derive(Debug, Serialize, Deserialize)]
struct ConnectInfo {
    // Naviagtes to specific chromedriver version depending on the os
    os: String,
    // Version of chromedriver installed
    version: String,
}


// TODO: Remove
// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command 
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}


#[tauri::command]
fn scheduler_scrape(state: tauri::State<'_, AppState>, window: tauri::Window) -> Result<(), String> {
    // Clone the Arc<Mutex<ConnectInfo>> since that is what we want to use
    let connect_info = Arc::clone(&state.connect_info);
    
    // Create new thread so this can run async
    thread::spawn(move || {
        // Runtime will allow an async function to run in a sync context
        let rt = tokio::runtime::Runtime::new().expect("Failed to create runtime");

        // Run check schedule scrape, if successful return unit type, otherwise return error
        match rt.block_on(async {
            check_schedule_scrape(&connect_info).await
        }) {
            Ok(()) => return window.emit("scrape_result", ()),
            Err(err) => return window.emit("scrape_result", err.to_string()),
        }
    });

    // Put this shere so program doesn't freak out 
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    std::env::set_var("RUST_BACKTRACE", "1");

    tauri::Builder::default()
        .setup(|app| {
            let connection_struct = setup_program().unwrap_or_else(|err| panic!("Error: '{err}'"));

            app.manage(AppState {
                connect_info: Arc::new(Mutex::new(connection_struct)),
            });

            let ascii = r#" 
   ____    ___                                   
  /\  _`\ /\_ \                                  
  \ \ \L\ \//\ \     ___   __  __     __   _ __  
   \ \ ,__/ \ \ \   / __`\/\ \/\ \  /'__`\/\`'__\
    \ \ \/   \_\ \_/\ \L\ \ \ \_/ |/\  __/\ \ \/ 
     \ \_\   /\____\ \____/\ \___/ \ \____\\ \_\ 
      \/_/   \/____/\/___/  \/__/   \/____/ \/_/ "#;

            println!("{ascii}");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, scheduler_scrape])
        .run(tauri::generate_context!())?;

    Ok(())
}