// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod program_setup;
mod tauri_command_backends;
mod chrome_functions;
mod database_functions;

use program_setup::*;
use tauri::{Manager, Window};
use tauri_command_backends::*;
use chrome_functions::*;

use serde::{Serialize, Deserialize};
use std::env;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use std::thread;
use anyhow::Result;
use std::time::Duration;


//Add custom menu items


// AppState to allow for this struct to be passed into functions via Tauri without needing 
// Global variable. Arc makes it read-only across threads, and mutex makes it writeable on
// one thread at a time. Acts like a singleton
struct AppState {
    connect_info: Arc<Mutex<ConnectInfo>>,
    startup_complete: AtomicBool,
}

// ConnectInfo struct (only one should ever be instantiated)
#[derive(Debug, Serialize, Deserialize, Default, Clone)]
struct ConnectInfo {
    // Naviagtes to specific chromedriver version depending on the os
    os: String,
    // Version of chromedriver installed
    version: String,
}

#[tauri::command]
fn startup_app(state: tauri::State<'_, AppState>) -> Result<(), String> {
    // First, check if we've already completed startup to prevent duplicate runs
    if state.startup_complete.load(Ordering::SeqCst) {
        println!("Startup already completed, skipping...");
        return Ok(());
    }

    // Create a blocking runtime specifically for this operation
    // We use a blocking runtime instead of a standard runtime because we're in a sync context
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()  // Enable both I/O and time drivers
        .build()
        .map_err(|e| format!("Failed to create runtime: {}", e))?;

    // Use the runtime to run our async operation synchronously
    // block_on transforms our async operation into a synchronous one
    let connection_struct = rt.block_on(async {
        setup_program().await
    }).map_err(|e| format!("Error: {}", e))?;

    // Update the connection info in our state
    rt.block_on(async {
        let mut connect_info = state.connect_info.lock().await;
        *connect_info = connection_struct;
    });

    // Mark startup as complete
    state.startup_complete.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
fn scheduler_scrape(state: tauri::State<'_, AppState>, window: tauri::Window) -> Result<(), String> {
    // Clone the Arc<Mutex<ConnectInfo>> to use within the thread
    let connect_info_mutex = Arc::clone(&state.connect_info);

    // Spawn a new thread for async processing
    thread::spawn(move || {
        // Create a Tokio runtime to run async code in this thread
        let rt = tokio::runtime::Runtime::new().expect("Failed to create runtime");

        // Run the async task using the runtime
        let result = rt.block_on(async {
            // Acquire a lock and clone the connect info for local use
            let mut connect_info = {
                let locked_connect_info = connect_info_mutex.lock().await;
                (*locked_connect_info).clone() // Clone the data to use outside the lock
            };

            chrome_update_check(&mut connect_info).await?;
            let driver = start_chromedriver(&connect_info).await?;

            // Perform the schedule scrape with the initialized driver
            perform_schedule_scrape(driver).await
        });

        // Emit the result to the frontend
        match result {
            Ok(_) => {
                let _ = window.emit("scrape_result", ());
            }
            Err(err) => {
                let _ = window.emit("scrape_result", err.to_string());
            }
        }
    });

    // Return Ok to indicate the command has started successfully
    Ok(())
}

#[tauri::command]
fn close_splashscreen(window: Window) {
    // Close splashscreen
    if let Some(splashscreen) = window.get_window("splashscreen") {
        splashscreen.close().unwrap();
    }
    // Show main window
    window.get_window("main").expect("no window labeled 'main' found").show().unwrap();
}

#[tauri::command]
fn show_splashscreen(window: Window) {
    std::thread::sleep(Duration::from_millis(500));
    if let Some(splashscreen) = window.get_window("splashscreen") {
        splashscreen.show().unwrap();
    }
}


fn main() -> Result<(), Box<dyn std::error::Error>> {
    std::env::set_var("RUST_BACKTRACE", "1");

    tauri::Builder::default()
        .setup(|app| {

            app.manage(AppState {
                connect_info: Arc::new(Mutex::new(ConnectInfo::default())),
                startup_complete: AtomicBool::new(false),
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
        .invoke_handler(tauri::generate_handler![
            scheduler_scrape,
            close_splashscreen,
            startup_app,
            show_splashscreen,
        ])
        .run(tauri::generate_context!())?;

    Ok(())
}