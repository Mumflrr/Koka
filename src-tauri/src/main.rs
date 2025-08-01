//! Main entry point for the Tauri application backend
//! 
//! This module serves as the centralized command dispatcher, taking frontend requests
//! and routing them to appropriate backend functions. It handles the conversion of
//! Rust errors to frontend-compatible string messages and manages the application
//! lifecycle including startup, database initialization, and window management.

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// === MODULE IMPORTS ===
mod tauri_backend;
mod database_functions;
mod services;
mod objects;
mod credentials;

use database_functions::*;
use tauri::{Manager, Window};
use tauri_backend::{scrape_classes::{setup_scrape}, event_processor::{EventProcessor, ProcessedEventsResult}, credentials::{get_secret_with_authorization, setup_master_password, store_secret_key}};
use services::*;
use objects::*;

use std::{env};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use anyhow::{Result};

// === APPLICATION LIFECYCLE COMMANDS ===

/**
 * Initializes the application backend on first startup
 */
#[tauri::command]
async fn startup_app(state: tauri::State<'_, AppState>) -> Result<(), String> {
    // Atomic check-and-set to ensure startup only runs once
    if state.startup_complete.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        println!("Startup already completed, skipping.");
        return Ok(());
    }
    println!("Starting up the application backend...");
    
    // Delegate to services module for Chrome/ChromeDriver setup
    setup_program(&state.db_pool, state.connect_info.clone()).await
        .map_err(|e| format!("Error during program setup: {e}"))
}

/**
 * Closes the splash screen and shows the main application window
 */
#[tauri::command]
fn close_splashscreen(window: Window) {
    if let Some(splashscreen) = window.get_window("splashscreen") {
        splashscreen.close().unwrap();
    }
    if let Some(main_window) = window.get_window("main") {
        main_window.show().unwrap();
    }
}

/**
 * Shows the splash screen window
 */
#[tauri::command]
fn show_splashscreen(window: Window) {
    if let Some(splashscreen) = window.get_window("splashscreen") {
        splashscreen.show().unwrap();
    }
}

// === SCHEDULE GENERATION AND MANAGEMENT COMMANDS ===

/**
 * Generates new class schedules based on provided parameters
 */
#[tauri::command]
async fn generate_schedules(parameters: ScrapeClassesParameters, state: tauri::State<'_, AppState>) -> Result<Vec<Vec<Class>>, String> {
    setup_scrape(parameters, state).await
        .map_err(|err| err.to_string())
}

/**
 * Deletes a schedule from both regular schedules and favorites
 */
#[tauri::command]
async fn delete_schedule(id: String, is_favorited: bool, state: tauri::State<'_, AppState>) -> Result<(), String> {
    if is_favorited {
        FavoriteRepository::change_status(id.clone(), None, &state.db_pool).await
            .map_err(|e| format!("Failed to remove from favorites: {e}"))?;
    }
    
    ScheduleRepository::delete(id, &state.db_pool).await
        .map_err(|e| format!("Failed to delete from schedules: {e}"))
}

/**
 * Toggles the favorite status of a schedule
 */
#[tauri::command]
async fn change_favorite_schedule(id: String, is_favorited: bool, schedule: Vec<Class>, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let schedule_option = if is_favorited { None } else { Some(schedule) };
    FavoriteRepository::change_status(id, schedule_option, &state.db_pool).await
        .map_err(|e| format!("Failed to change favorite status: {e}"))
}

/**
 * Retrieves all schedules from a specified table
 */
#[tauri::command]
async fn get_schedules(table: String, state: tauri::State<'_, AppState>) -> Result<Vec<Vec<Class>>, String> {
    ScheduleRepository::get_all(&table, &state.db_pool).await
        .map_err(|e| format!("Failed to get schedules: {e}"))
}

/**
 * Gets the currently selected/pinned schedule index
 */
#[tauri::command]
async fn get_display_schedule(state: tauri::State<'_, AppState>) -> Result<Option<i16>, String> {
    SystemRepository::get_display_schedule(&state.db_pool).await.map_err(|e| e.to_string())
}

/**
 * Sets the currently selected/pinned schedule
 */
#[tauri::command]
async fn set_display_schedule(id: Option<i16>, state: tauri::State<'_, AppState>) -> Result<(), String> {
    SystemRepository::set_display_schedule(id, &state.db_pool).await.map_err(|e| e.to_string())
}

// === EVENT MANAGEMENT COMMANDS ===

/**
 * Creates a new user-defined event
 */
#[tauri::command]
async fn create_event(event_data: NewEvent, state: tauri::State<'_, AppState>) -> Result<Event, String> { 
    EventRepository::save("events", event_data, &state.db_pool).await
        .map_err(|e| format!("Failed to save event: {e}"))
}

/**
 * Retrieves and processes all user events for calendar display
 */
#[tauri::command]
async fn get_events(state: tauri::State<'_, AppState>) -> Result<ProcessedEventsResult, String> {
    let raw_events = EventRepository::load_all("events", &state.db_pool).await
        .map_err(|e| format!("Failed to load events: {e}"))?;
    
    let processed_events = EventProcessor::process_events(raw_events);
    Ok(processed_events)
}

/**
 * Deletes a user event by ID
 */
#[tauri::command]
async fn delete_event(event_id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    EventRepository::delete("events", event_id, &state.db_pool).await
        .map_err(|e| format!("Failed to delete event: {e}"))
}

/**
 * Updates an existing user event
 */
#[tauri::command]
async fn update_event(event: Event, state: tauri::State<'_, AppState>) -> Result<(), String> {
    EventRepository::update("events", event, &state.db_pool).await
        .map_err(|e| format!("Failed to update event: {e}"))
}

// === CLASS PARAMETER MANAGEMENT COMMANDS ===

/**
 * Retrieves all class parameters for schedule generation
 */
#[tauri::command]
async fn get_classes(state: tauri::State<'_, AppState>) -> Result<Vec<ClassParam>, String> {
    ClassParamRepository::get_all(&state.db_pool).await
        .map_err(|e| format!("Failed to get classes: {e}"))
}

/**
 * Updates an existing class parameter
 */
#[tauri::command]
async fn update_class(class: ClassParam, state: tauri::State<'_, AppState>) -> Result<(), String> {
    ClassParamRepository::update(class, &state.db_pool).await
        .map_err(|e| format!("Failed to update classes: {e}"))
}

/**
 * Removes a class parameter from the database
 */
#[tauri::command]
async fn remove_class(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    ClassParamRepository::remove(id, &state.db_pool).await
        .map_err(|e| format!("Failed to remove class: {e}"))
}

// === CREDENTIAL MANAGEMENT COMMANDS (API Layer) ===
// These commands act as a thin wrapper around the logic in `credentials.rs`.
// Their job is to call the implementation and convert any error into a String for the frontend.

#[tauri::command]
async fn setup_password(password: String) -> Result<(), String> {
    tauri_backend::credentials::setup_master_password(password).await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn store_secret(key_name: String, secret_value: String) -> Result<(), String> {
    tauri_backend::credentials::store_secret_key(key_name, secret_value).await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_secret(key_name: String, master_password: String) -> Result<String, String> {
    tauri_backend::credentials::get_secret_with_authorization(key_name, master_password).await
        .map_err(|e| e.to_string())
}

// === MAIN APPLICATION ENTRY POINT ===

/**
 * Main application entry point
 */
fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Enable detailed error backtraces for debugging
    std::env::set_var("RUST_BACKTRACE", "1");

    // Initialize SQLite database connection pool
    let manager = r2d2_sqlite::SqliteConnectionManager::file("programData.db");
    let pool = r2d2::Pool::new(manager)?;
    
    // Create database schema if it doesn't exist
    initialize_database(&pool)?;

    // Build and configure Tauri application
    tauri::Builder::default()
        .setup(move |app| {
            // Initialize shared application state
            app.manage(AppState {
                db_pool: pool,
                connect_info: Arc::new(Mutex::new(ConnectInfo::default())),
                startup_complete: AtomicBool::new(false),
            });
            
            // Display application banner
            let ascii = r#"
 _  __ ____  _  __ ____ 
/ |/ //  _ \/ |/ //  _ \
|   / | / \||   / | / \|
|   \ | \_/||   \ | |-||
\_|\_\\____/\_|\_\\_/ \|
                        "#;
            println!("{ascii}");
            Ok(())
        })
        // Register all Tauri command handlers for frontend communication
        .invoke_handler(tauri::generate_handler![
            // Application lifecycle commands
            startup_app, close_splashscreen, show_splashscreen,
            
            // Schedule generation and management commands
            generate_schedules, delete_schedule, change_favorite_schedule, 
            get_schedules, get_display_schedule, set_display_schedule,
            
            // Event management commands
            create_event, get_events, delete_event, update_event,
            
            // Class parameter management commands
            get_classes, update_class, remove_class,
            
            // Credential management commands
            setup_password,
            store_secret,
            get_secret
        ])
        .run(tauri::generate_context!())?;
    Ok(())
}