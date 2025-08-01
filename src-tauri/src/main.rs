//! Main entry point for the Tauri application backend
//!
//! This module serves as the centralized command dispatcher, taking frontend requests
//! and routing them to appropriate backend functions. It handles the conversion of
//! Rust errors to frontend-compatible string messages and manages the application
//! lifecycle including startup, database initialization, and window management.

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Production build check: This will cause a compilation error if you
// accidentally try to build for production with debug assertions enabled.
#[cfg(all(not(debug_assertions), tauri_build))]
compile_error!("Production builds must be compiled in release mode.");

// === MODULE IMPORTS ===
mod tauri_backend;
mod database_functions;
mod services;
mod objects;
mod credentials;

use database_functions::*;
use tauri::{Manager, Window};
use tauri_backend::{scrape_classes::{setup_scrape}, event_processor::{EventProcessor, ProcessedEventsResult}};
use services::*;
use objects::*;
use tauri_backend::credentials as cred_api; // aliased for clarity
use zeroize::Zeroizing; // For securely wrapping passwords

use std::{env};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use anyhow::{Result};

// === APPLICATION LIFECYCLE COMMANDS ===
#[tauri::command]
async fn startup_app(state: tauri::State<'_, AppState>) -> Result<(), String> {
    if state.startup_complete.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        println!("Startup already completed, skipping.");
        return Ok(());
    }
    println!("Starting up the application backend...");
    setup_program(&state.db_pool, state.connect_info.clone()).await
        .map_err(|e| format!("Error during program setup: {e}"))
}

#[tauri::command]
fn close_splashscreen(window: Window) {
    if let Some(splashscreen) = window.get_window("splashscreen") { splashscreen.close().unwrap(); }
    if let Some(main_window) = window.get_window("main") { main_window.show().unwrap(); }
}

#[tauri::command]
fn show_splashscreen(window: Window) {
    if let Some(splashscreen) = window.get_window("splashscreen") { splashscreen.show().unwrap(); }
}

// === SCHEDULE & EVENT MANAGEMENT (Existing Commands) ===
#[tauri::command]
async fn generate_schedules(parameters: ScrapeClassesParameters, state: tauri::State<'_, AppState>) -> Result<Vec<Vec<Class>>, String> {
    setup_scrape(parameters, state).await.map_err(|err| err.to_string())
}
#[tauri::command]
async fn delete_schedule(id: String, is_favorited: bool, state: tauri::State<'_, AppState>) -> Result<(), String> {
    if is_favorited { FavoriteRepository::change_status(id.clone(), None, &state.db_pool).await.map_err(|e| format!("Failed to remove from favorites: {e}"))?; }
    ScheduleRepository::delete(id, &state.db_pool).await.map_err(|e| format!("Failed to delete from schedules: {e}"))
}
#[tauri::command]
async fn change_favorite_schedule(id: String, is_favorited: bool, schedule: Vec<Class>, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let schedule_option = if is_favorited { None } else { Some(schedule) };
    FavoriteRepository::change_status(id, schedule_option, &state.db_pool).await.map_err(|e| format!("Failed to change favorite status: {e}"))
}
#[tauri::command]
async fn get_schedules(table: String, state: tauri::State<'_, AppState>) -> Result<Vec<Vec<Class>>, String> {
    ScheduleRepository::get_all(&table, &state.db_pool).await.map_err(|e| format!("Failed to get schedules: {e}"))
}
#[tauri::command]
async fn get_display_schedule(state: tauri::State<'_, AppState>) -> Result<Option<i16>, String> {
    SystemRepository::get_display_schedule(&state.db_pool).await.map_err(|e| e.to_string())
}
#[tauri::command]
async fn set_display_schedule(id: Option<i16>, state: tauri::State<'_, AppState>) -> Result<(), String> {
    SystemRepository::set_display_schedule(id, &state.db_pool).await.map_err(|e| e.to_string())
}
#[tauri::command]
async fn create_event(event_data: NewEvent, state: tauri::State<'_, AppState>) -> Result<Event, String> {
    EventRepository::save("events", event_data, &state.db_pool).await.map_err(|e| format!("Failed to save event: {e}"))
}
#[tauri::command]
async fn get_events(state: tauri::State<'_, AppState>) -> Result<ProcessedEventsResult, String> {
    let raw_events = EventRepository::load_all("events", &state.db_pool).await.map_err(|e| format!("Failed to load events: {e}"))?;
    Ok(EventProcessor::process_events(raw_events))
}
#[tauri::command]
async fn delete_event(event_id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    EventRepository::delete("events", event_id, &state.db_pool).await.map_err(|e| format!("Failed to delete event: {e}"))
}
#[tauri::command]
async fn update_event(event: Event, state: tauri::State<'_, AppState>) -> Result<(), String> {
    EventRepository::update("events", event, &state.db_pool).await.map_err(|e| format!("Failed to update event: {e}"))
}
#[tauri::command]
async fn get_classes(state: tauri::State<'_, AppState>) -> Result<Vec<ClassParam>, String> {
    ClassParamRepository::get_all(&state.db_pool).await.map_err(|e| format!("Failed to get classes: {e}"))
}
#[tauri::command]
async fn update_class(class: ClassParam, state: tauri::State<'_, AppState>) -> Result<(), String> {
    ClassParamRepository::update(class, &state.db_pool).await.map_err(|e| format!("Failed to update classes: {e}"))
}
#[tauri::command]
async fn remove_class(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    ClassParamRepository::remove(id, &state.db_pool).await.map_err(|e| format!("Failed to remove class: {e}"))
}

// === NEW/UPDATED CREDENTIAL MANAGEMENT COMMANDS ===
#[tauri::command]
async fn setup_master_password_cmd(password: String) -> Result<(), String> {
    cred_api::setup_master_password(Zeroizing::new(password))
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn change_master_password_cmd(old_password: String, new_password: String) -> Result<(), String> {
    cred_api::change_master_password(Zeroizing::new(old_password), Zeroizing::new(new_password))
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn store_credentials_cmd(username: String, app_password: String, master_password: String) -> Result<(), String> {
    cred_api::store_credentials(username, Zeroizing::new(app_password), Zeroizing::new(master_password))
    .await
    .map_err(|e| e.to_string())
}
#[tauri::command]
async fn get_credentials_cmd(master_password: String) -> Result<(String, String), String> {
    let (username, password) = cred_api::get_credentials(Zeroizing::new(master_password))
        .await
        .map_err(|e| e.to_string())?;
    Ok((username, password.to_string()))
}
#[tauri::command]
async fn is_master_password_set_cmd() -> Result<bool, String> {
    cred_api::is_master_password_set().await.map_err(|e| e.to_string())
}

// === MAIN APPLICATION ENTRY POINT ===
fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Environment Hardening: Disable backtrace in release builds to avoid leaking info.
    #[cfg(not(debug_assertions))]
    std::env::remove_var("RUST_BACKTRACE");
    #[cfg(debug_assertions)]
    std::env::set_var("RUST_BACKTRACE", "1");

    // Initialize tracing (for logging/audit trail)
    tracing_subscriber::fmt().with_max_level(tracing::Level::INFO).init();

    let manager = r2d2_sqlite::SqliteConnectionManager::file("programData.db");
    let pool = r2d2::Pool::new(manager)?;
    initialize_database(&pool)?;

    tauri::Builder::default()
        .setup(|app| {
            app.manage(AppState {
                db_pool: pool,
                connect_info: Arc::new(Mutex::new(ConnectInfo::default())),
                startup_complete: AtomicBool::new(false),
            });
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
            setup_master_password_cmd,
            change_master_password_cmd,
            store_credentials_cmd,
            get_credentials_cmd,
            is_master_password_set_cmd
        ])
        .run(tauri::generate_context!())?;
    Ok(())
}