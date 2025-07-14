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

use database_functions::*;
use tauri::{Manager, Window};
use tauri_backend::{scrape_classes::{setup_scrape}, event_processor::{EventProcessor, ProcessedEventsResult}};
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
 * 
 * This command handles the complete application initialization process:
 * 1. Ensures startup only runs once using atomic boolean
 * 2. Sets up Chrome/ChromeDriver resources
 * 3. Initializes database connections and version tracking
 * 4. Updates shared application state
 * 
 * Uses compare_exchange to prevent multiple concurrent startup attempts.
 * 
 * @param {tauri::State<AppState>} state - Shared application state containing database pool and connection info
 * @returns {Result<(), String>} Success or error message for frontend
 * @throws {String} If Chrome setup, database initialization, or state management fails
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
        .map_err(|e| format!("Error during program setup: {}", e))
}

/**
 * Closes the splash screen and shows the main application window
 * 
 * This command manages the transition from loading screen to main interface:
 * 1. Closes the splash screen window
 * 2. Shows the main application window
 * 
 * @param {Window} window - Tauri window manager for controlling application windows
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
 * 
 * Used to display loading screen during long-running operations or app restart.
 * 
 * @param {Window} window - Tauri window manager
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
 * 
 * This command orchestrates the complete schedule generation process:
 * 1. Validates input parameters (courses, constraints, user events)
 * 2. Launches Chrome browser for web scraping
 * 3. Scrapes course data from university systems
 * 4. Generates optimized schedule combinations
 * 5. Stores results in database
 * 
 * @param {ScrapeClassesParameters} parameters - Schedule generation parameters
 * @param {Vec<ClassParam>} parameters.classes - Course codes and sections to include
 * @param {Vec<bool>} parameters.params_checkbox - Generation constraints (open sections, waitlist OK, etc.)
 * @param {Vec<Event>} parameters.events - User-defined events to avoid conflicts
 * @param {tauri::State<AppState>} state - Application state for database and Chrome access
 * @returns {Result<Vec<Vec<Class>>, String>} Generated schedules or error message
 * @throws {String} If web scraping fails, no valid schedules found, or database errors occur
 */
#[tauri::command]
async fn generate_schedules(parameters: ScrapeClassesParameters, state: tauri::State<'_, AppState>) -> Result<Vec<Vec<Class>>, String> {
    setup_scrape(parameters, state).await
        .map_err(|err| err.to_string())
}

/**
 * Deletes a schedule from both regular schedules and favorites
 * 
 * This command handles the complete schedule deletion process:
 * 1. Removes from favorites table if currently favorited
 * 2. Removes from main schedules table
 * 3. Ensures referential integrity across tables
 * 
 * @param {String} id - Unique schedule identifier (stringified schedule data)
 * @param {bool} is_favorited - Whether the schedule is currently in favorites
 * @param {tauri::State<AppState>} state - Application state for database access
 * @returns {Result<(), String>} Success or error message
 * @throws {String} If database deletion fails or schedule not found
 */
#[tauri::command]
async fn delete_schedule(id: String, is_favorited: bool, state: tauri::State<'_, AppState>) -> Result<(), String> {
    // Remove from favorites first if needed
    if is_favorited {
        FavoriteRepository::change_status(id.clone(), None, &state.db_pool).await
            .map_err(|e| format!("Failed to remove from favorites: {}", e))?;
    }
    
    // Remove from main schedules table
    ScheduleRepository::delete(id, &state.db_pool).await
        .map_err(|e| format!("Failed to delete from schedules: {}", e))
}

/**
 * Toggles the favorite status of a schedule
 * 
 * This command manages the favorites system:
 * 1. If currently favorited: removes from favorites table
 * 2. If not favorited: adds to favorites table with full schedule data
 * 3. Maintains schedule data integrity for favorites restoration
 * 
 * @param {String} id - Unique schedule identifier
 * @param {bool} is_favorited - Current favorite status (true = remove, false = add)
 * @param {Vec<Class>} schedule - Complete schedule data for favorites storage
 * @param {tauri::State<AppState>} state - Application state for database access
 * @returns {Result<(), String>} Success or error message
 * @throws {String} If database operation fails
 */
#[tauri::command]
async fn change_favorite_schedule(id: String, is_favorited: bool, schedule: Vec<Class>, state: tauri::State<'_, AppState>) -> Result<(), String> {
    // Determine operation: None = remove from favorites, Some(schedule) = add to favorites
    let schedule_option = if is_favorited { None } else { Some(schedule) };
    FavoriteRepository::change_status(id, schedule_option, &state.db_pool).await
        .map_err(|e| format!("Failed to change favorite status: {}", e))
}

/**
 * Retrieves all schedules from a specified table
 * 
 * @param {String} table - Table name ("schedules" or "favorites")
 * @param {tauri::State<AppState>} state - Application state for database access
 * @returns {Result<Vec<Vec<Class>>, String>} Array of schedules or error message
 * @throws {String} If database query fails or table doesn't exist
 */
#[tauri::command]
async fn get_schedules(table: String, state: tauri::State<'_, AppState>) -> Result<Vec<Vec<Class>>, String> {
    ScheduleRepository::get_all(&table, &state.db_pool).await
        .map_err(|e| format!("Failed to get schedules: {}", e))
}

/**
 * Gets the currently selected/pinned schedule index
 * 
 * @param {tauri::State<AppState>} state - Application state for database access
 * @returns {Result<Option<i16>, String>} Schedule index or None if no schedule selected
 * @throws {String} If database query fails
 */
#[tauri::command]
async fn get_display_schedule(state: tauri::State<'_, AppState>) -> Result<Option<i16>, String> {
    SystemRepository::get_display_schedule(&state.db_pool).await.map_err(|e| e.to_string())
}

/**
 * Sets the currently selected/pinned schedule
 * 
 * @param {Option<i16>} id - Schedule index to pin, or None to unpin
 * @param {tauri::State<AppState>} state - Application state for database access
 * @returns {Result<(), String>} Success or error message
 * @throws {String} If database update fails
 */
#[tauri::command]
async fn set_display_schedule(id: Option<i16>, state: tauri::State<'_, AppState>) -> Result<(), String> {
    SystemRepository::set_display_schedule(id, &state.db_pool).await.map_err(|e| e.to_string())
}

// === EVENT MANAGEMENT COMMANDS ===

/**
 * Creates a new user-defined event
 * 
 * This command handles user event creation:
 * 1. Validates event data (title, times, days)
 * 2. Stores event in database with generated ID
 * 3. Returns complete event object with ID for frontend state
 * 
 * @param {NewEvent} event_data - Event data without ID
 * @param {String} event_data.title - Event title (required)
 * @param {i32} event_data.start_time - Start time as integer (HHMM format)
 * @param {i32} event_data.end_time - End time as integer (HHMM format)
 * @param {i32} event_data.day - Day bitmask (1=Sunday, 2=Monday, etc.)
 * @param {String} event_data.professor - Professor/instructor name
 * @param {String} event_data.description - Event description
 * @param {tauri::State<AppState>} state - Application state for database access
 * @returns {Result<Event, String>} Created event with ID or error message
 * @throws {String} If validation fails or database insertion fails
 */
#[tauri::command]
async fn create_event(event_data: NewEvent, state: tauri::State<'_, AppState>) -> Result<Event, String> { 
    EventRepository::save("events", event_data, &state.db_pool).await
        .map_err(|e| format!("Failed to save event: {}", e))
}

/**
 * Retrieves and processes all user events for calendar display
 * 
 * This command handles event data processing:
 * 1. Loads raw events from database
 * 2. Processes events into calendar-friendly format
 * 3. Organizes events by day and time category (timed vs no-time)
 * 4. Calculates positioning data for calendar rendering
 * 
 * @param {tauri::State<AppState>} state - Application state for database access
 * @returns {Result<ProcessedEventsResult, String>} Processed events organized for calendar or error
 * @throws {String} If database query fails or event processing fails
 */
#[tauri::command]
async fn get_events(state: tauri::State<'_, AppState>) -> Result<ProcessedEventsResult, String> {
    // Load raw events from database
    let raw_events = EventRepository::load_all("events", &state.db_pool).await
        .map_err(|e| format!("Failed to load events: {}", e))?;
    
    // Process events for calendar display (organize by day, calculate positions, etc.)
    let processed_events = EventProcessor::process_events(raw_events);
    Ok(processed_events)
}

/**
 * Deletes a user event by ID
 * 
 * @param {String} event_id - Unique event identifier
 * @param {tauri::State<AppState>} state - Application state for database access
 * @returns {Result<(), String>} Success or error message
 * @throws {String} If event not found or database deletion fails
 */
#[tauri::command]
async fn delete_event(event_id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    EventRepository::delete("events", event_id, &state.db_pool).await
        .map_err(|e| format!("Failed to delete event: {}", e))
}

/**
 * Updates an existing user event
 * 
 * @param {Event} event - Complete event object with ID and updated data
 * @param {tauri::State<AppState>} state - Application state for database access
 * @returns {Result<(), String>} Success or error message
 * @throws {String} If event not found, validation fails, or database update fails
 */
#[tauri::command]
async fn update_event(event: Event, state: tauri::State<'_, AppState>) -> Result<(), String> {
    EventRepository::update("events", event, &state.db_pool).await
        .map_err(|e| format!("Failed to update event: {}", e))
}

// === CLASS PARAMETER MANAGEMENT COMMANDS ===

/**
 * Retrieves all class parameters for schedule generation
 * 
 * Class parameters define which courses to include in schedule generation,
 * including course codes, sections, and instructor preferences.
 * 
 * @param {tauri::State<AppState>} state - Application state for database access
 * @returns {Result<Vec<ClassParam>, String>} Array of class parameters or error message
 * @throws {String} If database query fails
 */
#[tauri::command]
async fn get_classes(state: tauri::State<'_, AppState>) -> Result<Vec<ClassParam>, String> {
    ClassParamRepository::get_all(&state.db_pool).await
        .map_err(|e| format!("Failed to get classes: {}", e))
}

/**
 * Updates an existing class parameter
 * 
 * @param {ClassParam} class - Complete class parameter object with updated data
 * @param {tauri::State<AppState>} state - Application state for database access
 * @returns {Result<(), String>} Success or error message
 * @throws {String} If class not found, validation fails, or database update fails
 */
#[tauri::command]
async fn update_class(class: ClassParam, state: tauri::State<'_, AppState>) -> Result<(), String> {
    ClassParamRepository::update(class, &state.db_pool).await
        .map_err(|e| format!("Failed to update classes: {}", e))
}

/**
 * Removes a class parameter from the database
 * 
 * @param {String} id - Unique class parameter identifier
 * @param {tauri::State<AppState>} state - Application state for database access
 * @returns {Result<(), String>} Success or error message
 * @throws {String} If class not found or database deletion fails
 */
#[tauri::command]
async fn remove_class(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    ClassParamRepository::remove(id, &state.db_pool).await
        .map_err(|e| format!("Failed to remove class: {}", e))
}

// === MAIN APPLICATION ENTRY POINT ===

/**
 * Main application entry point
 * 
 * This function handles the complete application initialization:
 * 1. Sets up error reporting with backtraces
 * 2. Initializes SQLite database connection pool
 * 3. Creates and initializes database schema
 * 4. Configures Tauri application with shared state
 * 5. Registers all command handlers for frontend communication
 * 6. Displays ASCII art banner
 * 7. Starts the application event loop
 * 
 * @returns {Result<(), Box<dyn std::error::Error>>} Success or application startup error
 * @throws {Box<dyn std::error::Error>} If database initialization or Tauri setup fails
 * 
 * The AppState contains:
 * - db_pool: SQLite connection pool for database operations
 * - connect_info: Chrome/ChromeDriver connection information
 * - startup_complete: Atomic flag to prevent duplicate initialization
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
        // Register all Tauri command handlers for frontend communication
        .invoke_handler(tauri::generate_handler![
            // Application lifecycle commands
            startup_app, close_splashscreen, show_splashscreen,
            
            // Schedule generation and management commands
            generate_schedules, delete_schedule, change_favorite_schedule, 
            get_schedules, get_display_schedule, set_display_schedule,
            
            // Event management commands (REFACTORED: Event handlers are now cleaner)
            create_event, get_events, delete_event, update_event,
            
            // Class parameter management commands
            get_classes, update_class, remove_class,
        ])
        .run(tauri::generate_context!())?;
    Ok(())
}