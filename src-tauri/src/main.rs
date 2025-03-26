// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod program_setup;
mod tauri_backend;
mod chrome_functions;
mod database_functions;

use database_functions::{delete_events, save_event, load_events, Event};
use program_setup::*;
use tauri::{Manager, Window};
use tauri_backend::class_combinations::generate_combinations;
use tauri_backend::scrape_classes::*;
use chrome_functions::*;

use serde::{Serialize, Deserialize};
use std::{env, fmt, thread};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use anyhow::Result;
use std::time::Duration;

//TODO: Work on splashscreen when updating chrome
//TODO: Add custom menu items


// AppState to allow for this struct to be passed into functions via Tauri without needing 
// Global variable. Arc makes it read-only across threads, and mutex makes it writeable on
// one thread at a time. Acts like a singleton
struct AppState {
    connect_info: Arc<Mutex<ConnectInfo>>,
    startup_complete: AtomicBool,
}

#[derive(Clone, Serialize, Deserialize)]
pub enum EventType {
    Calendar,
    Scheduler
}

#[derive(Serialize, Deserialize, Clone)]
struct Class {
    code: String,
    name: String,
    description: String,
    classes: Vec<TimeBlock>,
}

#[derive(Serialize, Deserialize, Clone)]
struct TimeBlock {
    section: String,
    location: String,
    days: [((i32, i32), bool); 5],
    instructor: String,
}

#[derive(Serialize, Deserialize)]
struct ScrapeClassesParameters {
    params_checkbox: [bool; 3],
    classes: Vec<ClassParam>,
    events: Vec<EventParam>,
}

#[derive(Serialize, Deserialize)]
struct EventParam {
    time: (i32, i32),
    days: [bool; 5],
}

#[derive(Serialize, Deserialize)]
struct ClassParam {
    code: String, // Look for this code
    name: String, // Look for this name
    section: String, // Look for this section
    instructor: String, // Search for this instructor
}

// To use the `{}` marker, the trait `fmt::Display` must be implemented
// manually for the type.
impl fmt::Display for Class {
    // This trait requires `fmt` with this exact signature.
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        // Write code number and name
        write!(f, "{}, {}, <", self.code, self.name).unwrap();

        // For each block in that section (for example if a lab is attached)
        for item in self.classes.clone() {
            write!(f, "{}, [", item.section)?;
            // For each day in that block write the times
            for day in item.days {    
                if day.1 == true {
                    write!(f, "{} - {} ",day.0.0, day.0.1).unwrap();
                }
                else {write!(f, " NA ").unwrap()}
            }
            write!(f, "], {}, {}", item.location, item.instructor)?;
        }
        write!(f, ">, {}", self.description)
    }
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
fn close_splashscreen(window: Window) {
    // Close splashscreen
    if let Some(splashscreen) = window.get_window("splashscreen") {
        splashscreen.close().unwrap();
    }
    // Show main window
    window.get_window("main").expect("no window labeled 'main' found").show().unwrap();
}

//TODO: Show splashscreen not working if updating?
#[tauri::command]
fn show_splashscreen(window: Window) {
    std::thread::sleep(Duration::from_millis(500));
    if let Some(splashscreen) = window.get_window("splashscreen") {
        splashscreen.show().unwrap();
    }
}

#[tauri::command]
fn scheduler_scrape(parameters: ScrapeClassesParameters, state: tauri::State<'_, AppState>, window: tauri::Window) -> Result<(), String> {
    // Clone the Arc<Mutex<ConnectInfo>> to use within the thread
    let connect_info_mutex = Arc::clone(&state.connect_info);

    // Spawn a new thread for async processing
    thread::spawn(move || {
        // Create a Tokio runtime to run async code in this thread
        let rt = tokio::runtime::Runtime::new().expect("Failed to create runtime");

        // Run the async task using the runtime
        let result: Result<Vec<Vec<Class>>, anyhow::Error> = rt.block_on(async {
            // Acquire a lock and clone the connect info for local use
            let mut connect_info = {
                let locked_connect_info = connect_info_mutex.lock().await;
                (*locked_connect_info).clone() // Clone the data to use outside the lock
            };

            // Use match or map_err to convert errors to String
            chrome_update_check(&mut connect_info).await?;  
            let driver = start_chromedriver(&connect_info).await?;

            // Perform the schedule scrape with the initialized driver
            let classes = perform_schedule_scrape(parameters, driver).await?;
                
            // Return the final result
            generate_combinations(classes).await

        });

        // Emit the result to the frontend
        match result {
            Ok(classes) => {
                let _ = window.emit("scrape_result", classes);
            }
            Err(err) => {
                let _ = window.emit("scrape_result", err.to_string());
            }
        }
    });

    // Return Ok to indicate the command has run successfully
    Ok(())
}

#[tauri::command]
async fn create_event(event: Event, table: String) -> Result<(), String> {
    save_event(table, event).await
        .map_err(|e| format!("Failed to save event: {}", e))
}

#[tauri::command]
async fn get_events(table: String) -> Result<Vec<Event>, String> {
    load_events(table).await
        .map_err(|e| format!("Failed to load events: {}", e))
}

#[tauri::command]
async fn delete_event(event_id: String, table: String) -> Result<(), String> {
    delete_events(table, event_id).await
        .map_err(|e| format!("Failed to delete event: {}", e))
}


fn main() -> Result<(), Box<dyn std::error::Error>> {
    std::env::set_var("RUST_BACKTRACE", "1");

    tauri::Builder::default()
        .setup(|app| {

            app.manage(AppState {
                connect_info: Arc::new(Mutex::new(ConnectInfo::default())),
                startup_complete: AtomicBool::new(false),
            });

            app.manage(Mutex::new(Vec::<Event>::new()));

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
            create_event,
            get_events,
            delete_event,
        ])
        .run(tauri::generate_context!())?;

    Ok(())
}