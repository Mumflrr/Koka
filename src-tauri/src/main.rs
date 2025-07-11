// src-tauri/src/main.rs
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod tauri_backend;
mod database_functions;
mod services;
mod event_processor;
mod objects;

use database_functions::*;
use tauri::{Manager, Window};
use tauri_backend::{scrape_classes::{setup_scrape}};
use services::*;
use event_processor::{EventProcessor, ProcessedEventsResult};
use objects::*;

use std::{env};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use anyhow::{Result};

#[tauri::command]
async fn startup_app(state: tauri::State<'_, AppState>) -> Result<(), String> {
    if state.startup_complete.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
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
    setup_scrape(parameters, state).await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn delete_schedule(id: String, is_favorited: bool, state: tauri::State<'_, AppState>) -> Result<(), String> {
    if is_favorited {
        FavoriteRepository::change_status(id.clone(), None, &state.db_pool).await
            .map_err(|e| format!("Failed to remove from favorites: {}", e))?;
    }
    ScheduleRepository::delete(id, &state.db_pool).await
        .map_err(|e| format!("Failed to delete from schedules: {}", e))
}

#[tauri::command]
async fn create_event(event: Event, table: String, state: tauri::State<'_, AppState>) -> Result<(), String> { 
    EventRepository::save(&table, event, &state.db_pool).await
        .map_err(|e| format!("Failed to save event: {}", e))
}

#[tauri::command]
async fn get_events(table: String, state: tauri::State<'_, AppState>) -> Result<ProcessedEventsResult, String> {
    let raw_events = EventRepository::load_all(&table, &state.db_pool).await
        .map_err(|e| format!("Failed to load events: {}", e))?;
    
    let processed_events = EventProcessor::process_events(raw_events);
    Ok(processed_events)
}

#[tauri::command]
async fn delete_event(event_id: String, table: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    EventRepository::delete(&table, event_id, &state.db_pool).await
        .map_err(|e| format!("Failed to delete event: {}", e))
}

#[tauri::command]
async fn update_event(event: Event, table: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    EventRepository::update(&table, event, &state.db_pool).await
        .map_err(|e| format!("Failed to update event: {}", e))
}

#[tauri::command]
async fn change_favorite_schedule(id: String, is_favorited: bool, schedule: Vec<Class>, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let schedule_option = if is_favorited { None } else { Some(schedule) };
    FavoriteRepository::change_status(id, schedule_option, &state.db_pool).await
        .map_err(|e| format!("Failed to change favorite status: {}", e))
}

#[tauri::command]
async fn get_classes(state: tauri::State<'_, AppState>) -> Result<Vec<ClassParam>, String> {
    ClassParamRepository::get_all(&state.db_pool).await
        .map_err(|e| format!("Failed to get classes: {}", e))
}

#[tauri::command]
async fn update_class(class: ClassParam, state: tauri::State<'_, AppState>) -> Result<(), String> {
    ClassParamRepository::update(class, &state.db_pool).await
        .map_err(|e| format!("Failed to update classes: {}", e))
}

#[tauri::command]
async fn remove_class(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    ClassParamRepository::remove(id, &state.db_pool).await
        .map_err(|e| format!("Failed to remove class: {}", e))
}

#[tauri::command]
async fn get_schedules(table: String, state: tauri::State<'_, AppState>) -> Result<Vec<Vec<Class>>, String> {
    ScheduleRepository::get_all(&table, &state.db_pool).await
        .map_err(|e| format!("Failed to get schedules: {}", e))
}

#[tauri::command]
async fn get_display_schedule(state: tauri::State<'_, AppState>) -> Result<Option<i16>, String> {
    SystemRepository::get_display_schedule(&state.db_pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_display_schedule(id: Option<i16>, state: tauri::State<'_, AppState>) -> Result<(), String> {
    SystemRepository::set_display_schedule(id, &state.db_pool).await.map_err(|e| e.to_string())
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
            create_event, get_events, delete_event, update_event, change_favorite_schedule,
            get_schedules, delete_schedule, get_classes, update_class, remove_class,
            get_display_schedule, set_display_schedule,
        ])
        .run(tauri::generate_context!())?;
    Ok(())
}