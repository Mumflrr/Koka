// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod program_setup;
mod tauri_backend;
mod chrome_functions;
mod database_functions;

use database_functions::{delete_calendar_events, delete_scheduler_events, load_calendar_events, load_scheduler_events, save_calendar_events, save_scheduler_events, Event};
use program_setup::*;
use tauri::{Manager, State, Window};
use tauri_backend::scrape_classes::*;
use chrome_functions::*;

use serde::{Serialize, Deserialize};
use std::thread::sleep;
use std::{env, fmt, thread};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
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

#[derive(Clone, Serialize, Deserialize)]
pub enum EventType {
    Calendar,
    Scheduler
}

#[derive(Serialize, Deserialize, Clone)]
struct Class {
    code: String,
    name: String,
    section: String,
    time: (i32, i32),
    days: Vec<bool>,
    location: String,
    instructor: String,
    description: String,
}

#[derive(Serialize, Deserialize)]
struct ClassParam {
    code: String,
    name: String,
    section: String,
    time: Vec<(i32, i32)>,
    days: Vec<bool>,
    instructor: String,
}

// To use the `{}` marker, the trait `fmt::Display` must be implemented
// manually for the type.
impl fmt::Display for Class {
    // This trait requires `fmt` with this exact signature.
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        // Write strictly the first element into the supplied output
        // stream: `f`. Returns `fmt::Result` which indicates whether the
        // operation succeeded or failed. Note that `write!` uses syntax which
        // is very similar to `println!`.
        write!(f, "{}, {}, {}, {} - {}, [", self.code, self.name, self.section, self.time.0, self.time.1).unwrap();
        for item in self.days.clone() {
            write!(f, "{}", item).unwrap();
        }
        write!(f, "], {}, {}, {}", self.location, self.instructor, self.description)
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
fn scheduler_scrape(params: [bool; 3] , classes: Vec<ClassParam>, state: tauri::State<'_, AppState>, window: tauri::Window) -> Result<(), String> {
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
            let classes = perform_schedule_scrape(params, classes, driver).await;
            match classes {
                Ok(classes) => Ok(classes),
                Err(e) => Err(e),
            }
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

// Create event method
#[tauri::command]
fn create_event(event: Event, event_type: EventType, events_state: State<Mutex<Vec<Event>>>) -> Result<(), String> {
    let rt = tokio::runtime::Runtime::new()
        .expect("Failed to create runtime");
    
    let mut events = rt.block_on(events_state.lock());
    events.push(event.clone());
    
    let events_to_save = events.clone();
    
    thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new()
            .expect("Failed to create runtime");
            
        let result = rt.block_on(async {
            match event_type {
                EventType::Calendar => save_calendar_events(events_to_save).await,
                EventType::Scheduler => save_scheduler_events(events_to_save).await,
            }
        });
        
        if let Err(e) = result {
            eprintln!("Error saving events: {}", e);
        }
    });

    Ok(())
}

// Get events method
#[tauri::command]
fn get_events(event_type: EventType, events_state: State<Mutex<Vec<Event>>>) -> Result<Vec<Event>, String> {
    let rt = tokio::runtime::Runtime::new()
        .expect("Failed to create runtime");
    
    let event_type_clone = event_type.clone();
    let handle = thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new()
            .expect("Failed to create runtime");
            
        rt.block_on(async {
            match event_type_clone {
                EventType::Calendar => load_calendar_events().await,
                EventType::Scheduler => load_scheduler_events().await,
            }
            .map_err(|e| format!("Failed to load events: {}", e))
        })
    });
    
    // Update the state with the loaded events
    match handle.join() {
        Ok(Ok(loaded_events)) => {
            let mut events = rt.block_on(events_state.lock());
            *events = loaded_events.clone();
            Ok(loaded_events)
        },
        Ok(Err(e)) => Err(e),
        Err(_) => Err("Thread panicked while loading events".to_string())
    }
}

// Delete event method
#[tauri::command]
async fn delete_event(event_id: i32, event_type: EventType, events_state: State<'_, Mutex<Vec<Event>>>) -> Result<(), String> {
    // First try to delete from database
    let result = match event_type {
        EventType::Calendar => delete_calendar_events(event_id).await,
        EventType::Scheduler => delete_scheduler_events(event_id).await,
    };
    
    if let Err(e) = result {
        return Err(format!("Failed to delete event: {}", e));
    }
    
    // If database deletion succeeds, update state
    let mut events = events_state.lock().await;
    events.retain(|e| e.id != event_id);
    
    Ok(())
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