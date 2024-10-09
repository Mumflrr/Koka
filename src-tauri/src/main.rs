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
use std::sync::Mutex;
use std::thread;
use anyhow::Result;


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

        // Run async function to completion since we cannot return a Future object
        let result = rt.block_on(async {
            // Acquire the lock inside the async block
            let connect_info = match connect_info.lock() {
                Ok(guard) => guard,
                Err(e) => return Some(format!("Failed to acquire lock: {}", e)),
            };
            
            // Check if schedule can and should be scraped, and if so do it
            check_schedule_scrape(&connect_info).await
        });

        // Send the result back to listener on the main thread in App.jsx
        let _ = window.emit("scrape_result", &result);
    });

    Ok(())
}

fn main() -> Result<()> {
    // Enable backtracing
    std::env::set_var("RUST_BACKTRACE", "1");

    // Run Tauri application
    tauri::Builder::default()
        .setup(|app| {
            // Setup the program
            let connection_struct = setup_program().unwrap();
            // Store the connection_struct in the app's managed state as Arc and Mutex
            app.manage(AppState {
                connect_info: Arc::new(Mutex::new(connection_struct)),
            });


            /*
 ____    ___                                   
/\  _`\ /\_ \                                  
\ \ \L\ \//\ \     ___   __  __     __   _ __  
 \ \ ,__/ \ \ \   / __`\/\ \/\ \  /'__`\/\`'__\
  \ \ \/   \_\ \_/\ \L\ \ \ \_/ |/\  __/\ \ \/ 
   \ \_\   /\____\ \____/\ \___/ \ \____\\ \_\ 
    \/_/   \/____/\/___/  \/__/   \/____/ \/_/  
  */


 /*
           _____                    _____           _______                   _____                    _____                    _____          
         /\    \                  /\    \         /::\    \                 /\    \                  /\    \                  /\    \         
        /::\    \                /::\____\       /::::\    \               /::\____\                /::\    \                /::\    \        
       /::::\    \              /:::/    /      /::::::\    \             /:::/    /               /::::\    \              /::::\    \       
      /::::::\    \            /:::/    /      /::::::::\    \           /:::/    /               /::::::\    \            /::::::\    \      
     /:::/\:::\    \          /:::/    /      /:::/~~\:::\    \         /:::/    /               /:::/\:::\    \          /:::/\:::\    \     
    /:::/__\:::\    \        /:::/    /      /:::/    \:::\    \       /:::/____/               /:::/__\:::\    \        /:::/__\:::\    \    
   /::::\   \:::\    \      /:::/    /      /:::/    / \:::\    \      |::|    |               /::::\   \:::\    \      /::::\   \:::\    \   
  /::::::\   \:::\    \    /:::/    /      /:::/____/   \:::\____\     |::|    |     _____    /::::::\   \:::\    \    /::::::\   \:::\    \  
 /:::/\:::\   \:::\____\  /:::/    /      |:::|    |     |:::|    |    |::|    |    /\    \  /:::/\:::\   \:::\    \  /:::/\:::\   \:::\____\ 
/:::/  \:::\   \:::|    |/:::/____/       |:::|____|     |:::|    |    |::|    |   /::\____\/:::/__\:::\   \:::\____\/:::/  \:::\   \:::|    |
\::/    \:::\  /:::|____|\:::\    \        \:::\    \   /:::/    /     |::|    |  /:::/    /\:::\   \:::\   \::/    /\::/   |::::\  /:::|____|
 \/_____/\:::\/:::/    /  \:::\    \        \:::\    \ /:::/    /      |::|    | /:::/    /  \:::\   \:::\   \/____/  \/____|:::::\/:::/    / 
          \::::::/    /    \:::\    \        \:::\    /:::/    /       |::|____|/:::/    /    \:::\   \:::\    \            |:::::::::/    /  
           \::::/    /      \:::\    \        \:::\__/:::/    /        |:::::::::::/    /      \:::\   \:::\____\           |::|\::::/    /   
            \::/____/        \:::\    \        \::::::::/    /         \::::::::::/____/        \:::\   \::/    /           |::| \::/____/    
             ~~               \:::\    \        \::::::/    /           ~~~~~~~~~~               \:::\   \/____/            |::|  ~|          
                               \:::\    \        \::::/    /                                      \:::\    \                |::|   |          
                                \:::\____\        \::/____/                                        \:::\____\               \::|   |          
                                 \::/    /         ~~                                               \::/    /                \:|   |          
                                  \/____/                                                            \/____/                  \|___|      
                                   */



            let ascii = r#""#;

            println!("{ascii}");

            Ok(())
        })
        // Load functions for Tauri to have access to
        .invoke_handler(tauri::generate_handler![greet, scheduler_scrape])
        .run(tauri::generate_context!())?;

    Ok(())
}