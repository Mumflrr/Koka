// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod program_setup;
mod tauri_backend;
mod chrome_functions;
mod database_functions;

use database_functions::{change_favorite_status, delete_events, get_class_by_name, get_combinations, load_events, save_class_sections, save_combinations_backend, save_event, Event};
use program_setup::*;
use tauri::{Manager, Window};
use tauri_backend::{scrape_classes::{perform_schedule_scrape, filter_classes}, class_combinations::generate_combinations};
use chrome_functions::*;

use serde::{Serialize, Deserialize};
use std::{env, fmt};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use anyhow::{Result, anyhow};
use std::time::Duration;
use std::collections::HashMap;


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

#[derive(Serialize, Deserialize, Clone)]
struct EventParam {
    time: (i32, i32),
    days: [bool; 5],
}

#[derive(Serialize, Deserialize, Clone)]
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
        for (idx, item) in self.classes.clone().iter().enumerate() {
            write!(f, "{}{}, [", if idx == 0 { "" } else { " & " }, item.section)?;
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
async fn generate_schedules(parameters: ScrapeClassesParameters, state: tauri::State<'_, AppState>) -> Result<Vec<Vec<Class>>, String> {
    // If no classes passed in then nothing to scrape
    if parameters.classes.is_empty() {
        return Err("No classes set to scrape".to_string());
    }

    // Clone the Arc<Mutex<ConnectInfo>> to use in async block
    let connect_info_mutex = Arc::clone(&state.connect_info);

    // Inner closure to capture all Results that could propagate due to '?'
    let result: Result<Vec<Vec<Class>>, anyhow::Error> = async {

        // Determine which classes to scrape vs. use cache
        let mut classes_to_scrape_params: Vec<ClassParam> = Vec::new();
        let mut cached_results: HashMap<usize, Vec<Class>> = HashMap::new(); // Store original index and cached data
        let mut scrape_indices: Vec<usize> = Vec::new(); // Store original indices of classes to scrape

        for (index, class_param) in parameters.classes.iter().enumerate() {
            let name = format!("{}{}", class_param.code, class_param.name);
            // Consider adding error handling for get_class_by_name if it can fail critically
            let database_classes = get_class_by_name(name.clone()).await.unwrap_or_else(|e| {
                 eprintln!("Warning: Failed to query cache for {}: {}", name, e);
                 Vec::new() // Treat as not cached if DB query fails
            });

            if !database_classes.is_empty() {
                // Found in cache
                cached_results.insert(index, database_classes);
            } else {
                // Not in cache, need to scrape
                classes_to_scrape_params.push(class_param.clone());
                scrape_indices.push(index);
            }
        }
        println!("Need to scrape {} classes.", classes_to_scrape_params.len());
        println!("Found {} classes in cache.", cached_results.len());

        // Perform scraping only if needed
        let mut scraped_results_map: HashMap<usize, Vec<Class>> = HashMap::new();
        if !classes_to_scrape_params.is_empty() {
            println!("Starting scrape...");
            let mut connect_info = {
                let locked_connect_info = connect_info_mutex.lock().await;
                (*locked_connect_info).clone()
            };
            chrome_update_check(&mut connect_info).await?;
            let driver = start_chromedriver(&connect_info).await?;

            // Create temporary parameters for scraping
            let scrape_params_for_call = ScrapeClassesParameters {
                 params_checkbox: parameters.params_checkbox, // Use original checkboxes
                 classes: classes_to_scrape_params, // Only classes needing scraping
                 events: parameters.events.clone(), // Use original events
            };

            // Perform the scrape
            let scraped_data = perform_schedule_scrape(&scrape_params_for_call, driver).await?;
            println!("Scrape finished, got {} results.", scraped_data.len());

            // Save scraped data (consider error handling)
            if let Err(e) = save_class_sections(&scraped_data).await {
                 eprintln!("Warning: Failed to save scraped class sections: {}", e);
            }

            // Map scraped results back to their original indices
            if scraped_data.len() == scrape_indices.len() {
                for (i, data) in scraped_data.into_iter().enumerate() {
                    let original_index = scrape_indices[i];
                    scraped_results_map.insert(original_index, data);
                }
            } else {
                 // This case indicates an internal error or mismatch in scraping results
                 eprintln!(
                    "Error: Mismatch between scraped results count ({}) and requested scrape count ({}).",
                    scraped_data.len(), scrape_indices.len()
                 );
                 return Err(anyhow!("Mismatch between scraped results and requested classes"));
            }
        }

        // Combine cached and scraped results in the original order
        let mut combined_classes: Vec<Vec<Class>> = vec![Vec::new(); parameters.classes.len()];
        for (index, cached_data) in cached_results {
             if index < combined_classes.len() {
                 combined_classes[index] = cached_data;
             } else {
                  eprintln!("Warning: Cached index {} out of bounds (len {})", index, combined_classes.len());
             }
        }
        for (index, scraped_data) in scraped_results_map {
             if index < combined_classes.len() { // Bounds check
                combined_classes[index] = scraped_data;
             } else {
                 // This should ideally not happen if indexing is correct
                 eprintln!("Warning: Scraped index {} out of bounds for combined_classes (len {})", index, combined_classes.len());
             }
        }

        // Filter the combined classes using the *original* parameters
        let filtered_classes = filter_classes(combined_classes, &parameters)?;

        // Generate combinations
        if filtered_classes.is_empty() && !parameters.classes.is_empty() {
            println!("No classes remained after filtering. Returning empty combinations.");
            // Return Ok with an empty Vec if filtering removed everything, but scraping was requested.
            // This avoids trying to generate combinations from nothing.
            return Ok(Vec::new());
        } else if filtered_classes.is_empty() {
             println!("No classes to generate combinations from.");
             return Ok(Vec::new());
        }

        // Generate new combinations and save them
        let combinations_generated = generate_combinations(filtered_classes).await?;
        save_combinations_backend(&combinations_generated).await?;

        Ok(combinations_generated)
    }
    .await;

    // Convert anyhow::Error to String for Result
    result.map_err(|err| {
        eprintln!("Error in generate_schedules async block: {:?}", err); // Log the detailed error
        err.to_string() // Return the stringified error to the frontend
    })
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

#[tauri::command]
async fn change_favorite_schedule(id: i32, is_favorited: bool, schedule: Vec<Class>) -> Result<(), String> {
    let schedule_option: Option<Vec<Class>>;
    if is_favorited {
        schedule_option = None;  
    }
    else {
        schedule_option = Some(schedule);
    }

    change_favorite_status(id, schedule_option).await
        .map_err(|e| format!("Failed to change favorite status: {}", e))
}

#[tauri::command]
async fn get_schedules(table: String) -> Result<Vec<Vec<Class>>, String> {
    get_combinations(table).await
        .map_err(|e| format!("Failed to get favorite schedules: {}", e))
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
            generate_schedules,
            close_splashscreen,
            startup_app,
            show_splashscreen,
            create_event,
            get_events,
            delete_event,
            change_favorite_schedule,
            get_schedules,
        ])
        .run(tauri::generate_context!())?;

    Ok(())
}