// src-tauri/src/main.rs
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod program_setup;
mod tauri_backend;
mod chrome_functions;
mod database_functions;

use database_functions::*;
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
use std::collections::HashMap;

pub type DbPool = r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>;

struct AppState {
    db_pool: DbPool,
    connect_info: Arc<Mutex<ConnectInfo>>,
    startup_complete: AtomicBool,
}

#[derive(Clone, Serialize, Deserialize)]
pub enum EventType { Calendar, Scheduler }

#[derive(Serialize, Deserialize, Clone)]
struct Class { code: String, name: String, description: String, classes: Vec<TimeBlock>, }

#[derive(Serialize, Deserialize, Clone)]
struct TimeBlock { section: String, location: String, days: [((i32, i32), bool); 5], instructor: String, }

#[derive(Serialize, Deserialize)]
struct ScrapeClassesParameters { params_checkbox: [bool; 3], classes: Vec<ClassParam>, events: Vec<EventParam>, }

#[derive(Serialize, Deserialize, Clone)]
struct EventParam { time: (i32, i32), days: [bool; 5], }

#[derive(Serialize, Deserialize, Clone)]
struct ClassParam { id: String, code: String, name: String, section: String, instructor: String, }

impl fmt::Display for Class {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}, {}, <", self.code, self.name)?;
        for (idx, item) in self.classes.iter().enumerate() {
            write!(f, "{}{}, [", if idx == 0 { "" } else { " & " }, item.section)?;
            for day in item.days {
                if day.1 { write!(f, "{:04}-{:04} ", day.0.0, day.0.1)?; }
                else { write!(f, " NA ")?; }
            }
            write!(f, "], {}, {}", item.location, item.instructor)?;
        }
        write!(f, ">, {}", self.description)
    }
}

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
struct ConnectInfo { os: String, version: String, }

#[tauri::command]
async fn startup_app(state: tauri::State<'_, AppState>) -> Result<(), String> {
    if state.startup_complete.compare_and_swap(false, true, Ordering::SeqCst) {
        println!("Startup already completed, skipping.");
        return Ok(());
    }
    println!("Starting up the application backend...");
    setup_program(&state.db_pool, state.connect_info.clone()).await
        .map_err(|e| format!("Error during program setup: {}", e))
}

#[tauri::command]
fn close_splashscreen(window: Window) {
    if let Some(splashscreen) = window.get_window("splashscreen") {
        splashscreen.close().unwrap();
    }
    if let Some(main_window) = window.get_window("main") {
        main_window.show().unwrap();
    }
}

#[tauri::command]
fn show_splashscreen(window: Window) {
    if let Some(splashscreen) = window.get_window("splashscreen") {
        splashscreen.show().unwrap();
    }
}

#[tauri::command]
async fn generate_schedules(parameters: ScrapeClassesParameters, state: tauri::State<'_, AppState>) -> Result<Vec<Vec<Class>>, String> {
    if parameters.classes.is_empty() {
        return Err("No classes set to scrape".to_string());
    }

    let connect_info_mutex = Arc::clone(&state.connect_info);
    let db_pool = state.db_pool.clone();

    let result: Result<Vec<Vec<Class>>, anyhow::Error> = async move {
        let mut classes_to_scrape_params: Vec<ClassParam> = Vec::new();
        let mut cached_results: HashMap<usize, Vec<Class>> = HashMap::new();
        let mut scrape_indices: Vec<usize> = Vec::new();

        for (index, class_param) in parameters.classes.iter().enumerate() {
            let name = format!("{}{}", class_param.code, class_param.name);
            let database_classes = get_class_by_name(name.clone(), &db_pool).await.unwrap_or_else(|e| {
                 eprintln!("Warning: Failed to query cache for {}: {}", name, e);
                 Vec::new()
            });

            if !database_classes.is_empty() {
                cached_results.insert(index, database_classes);
            } else {
                classes_to_scrape_params.push(class_param.clone());
                scrape_indices.push(index);
            }
        }

        let mut scraped_results_map: HashMap<usize, Vec<Class>> = HashMap::new();
        if !classes_to_scrape_params.is_empty() {
            let connect_info = connect_info_mutex.lock().await.clone();
            // Note: The check for Chrome updates is now handled at startup.
            // It is not re-checked here to avoid unnecessary delays.
            let driver = start_chromedriver(&connect_info).await?;
            
            let scrape_params_for_call = ScrapeClassesParameters {
                 params_checkbox: parameters.params_checkbox, 
                 classes: classes_to_scrape_params, 
                 events: parameters.events.clone(),
            };

            let scraped_data = perform_schedule_scrape(&scrape_params_for_call, driver).await?;
            
            if let Err(e) = save_class_sections(&scraped_data, &db_pool).await {
                 eprintln!("Warning: Failed to save scraped class sections: {}", e);
            }

            if scraped_data.len() == scrape_indices.len() {
                for (i, data) in scraped_data.into_iter().enumerate() {
                    let original_index = scrape_indices[i];
                    scraped_results_map.insert(original_index, data);
                }
            } else {
                 return Err(anyhow!("Mismatch between scraped results and requested classes"));
            }
        }

        let mut combined_classes: Vec<Vec<Class>> = vec![Vec::new(); parameters.classes.len()];
        for (index, cached_data) in cached_results {
             if index < combined_classes.len() { combined_classes[index] = cached_data; }
        }
        for (index, scraped_data) in scraped_results_map {
             if index < combined_classes.len() { combined_classes[index] = scraped_data; }
        }
        
        let filtered_classes = filter_classes(combined_classes, &parameters)?;
        if filtered_classes.iter().all(|group| group.is_empty()) { return Ok(Vec::new()); }

        let combinations_generated = generate_combinations(filtered_classes).await?;
        let mut ids = Vec::with_capacity(combinations_generated.len());
        for combination in &combinations_generated {
            ids.push(serde_json::to_string(combination)?);
        }

        save_combinations_backend(ids, &combinations_generated, &db_pool).await?;
        Ok(combinations_generated)
    }
    .await;

    result.map_err(|err| err.to_string())
}

#[tauri::command]
async fn delete_schedule(id: String, is_favorited: bool, state: tauri::State<'_, AppState>) -> Result<(), String> {
    if is_favorited {
        change_favorite_status(id.clone(), None, &state.db_pool).await
            .map_err(|e| format!("Failed to remove from favorites: {}", e))?;
    }
    delete_combination_backend(id, &state.db_pool).await
        .map_err(|e| format!("Failed to delete from combinations: {}", e))
}

#[tauri::command]
async fn create_event(event: Event, table: String, state: tauri::State<'_, AppState>) -> Result<(), String> { 
    save_event(table, event, &state.db_pool).await
        .map_err(|e| format!("Failed to save event: {}", e))
}

#[tauri::command]
async fn get_events(table: String, state: tauri::State<'_, AppState>) -> Result<Vec<Event>, String> {
    load_events(table, &state.db_pool).await
        .map_err(|e| format!("Failed to load events: {}", e))
}

#[tauri::command]
async fn delete_event(event_id: String, table: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    delete_events(table, event_id, &state.db_pool).await
        .map_err(|e| format!("Failed to delete event: {}", e))
}

#[tauri::command]
async fn change_favorite_schedule(id: String, is_favorited: bool, schedule: Vec<Class>, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let schedule_option = if is_favorited { None } else { Some(schedule) };
    change_favorite_status(id, schedule_option, &state.db_pool).await
        .map_err(|e| format!("Failed to change favorite status: {}", e))
}

#[tauri::command]
async fn get_classes(state: tauri::State<'_, AppState>) -> Result<Vec<ClassParam>, String> {
    get_parameter_classes(&state.db_pool).await
        .map_err(|e| format!("Failed to get classes: {}", e))
}

#[tauri::command]
async fn update_classes(class: ClassParam, state: tauri::State<'_, AppState>) -> Result<(), String> {
    update_parameter_classes(class, &state.db_pool).await
        .map_err(|e| format!("Failed to update classes: {}", e))
}

#[tauri::command]
async fn remove_class(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    remove_parameter_class(id, &state.db_pool).await
        .map_err(|e| format!("Failed to remove class: {}", e))
}

#[tauri::command]
async fn get_schedules(table: String, state: tauri::State<'_, AppState>) -> Result<Vec<Vec<Class>>, String> {
    get_combinations(table, &state.db_pool).await
        .map_err(|e| format!("Failed to get favorite schedules: {}", e))
}

#[tauri::command]
async fn get_display_schedule(state: tauri::State<'_, AppState>) -> Result<Option<i16>, String> {
    database_functions::get_display_schedule(&state.db_pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_display_schedule(id: Option<i16>, state: tauri::State<'_, AppState>) -> Result<(), String> {
    database_functions::set_display_schedule(id, &state.db_pool).await.map_err(|e| e.to_string())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    std::env::set_var("RUST_BACKTRACE", "1");

    let manager = r2d2_sqlite::SqliteConnectionManager::file("programData.db");
    let pool = r2d2::Pool::new(manager)?;
    initialize_database(&pool)?;

    tauri::Builder::default()
        .setup(move |app| {
            app.manage(AppState {
                db_pool: pool,
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
            generate_schedules, close_splashscreen, startup_app, show_splashscreen,
            create_event, get_events, delete_event, change_favorite_schedule,
            get_schedules, delete_schedule, get_classes, update_classes, remove_class,
            get_display_schedule, set_display_schedule,
        ])
        .run(tauri::generate_context!())?;
    Ok(())
}