//! Database functions and repository pattern implementation for the scheduling application
//! 
//! This module provides a clean abstraction layer over SQLite database operations using
//! the repository pattern. It handles all CRUD operations for events, schedules, class
//! parameters, and system configuration data. All database operations are wrapped in
//! async functions using tokio::spawn_blocking for non-blocking database access.

use crate::{objects::NewEvent, Class, ClassParam, ConnectInfo, DbPool, Event};
use anyhow::anyhow;
use rusqlite::{params, OptionalExtension, Transaction};
use uuid::Uuid;

// === CONFIGURATION CONSTANTS ===

/** Primary key for the system configuration table */
const DATA_TABLE_ID: i32 = 0;

/** Batch size for bulk database operations to optimize performance */
const BATCH_SIZE: usize = 100;

/** Whitelist of valid table names to prevent SQL injection */
const VALID_TABLES: &[&str] = &["events", "schedules", "favorites"];

// === UTILITY FUNCTIONS ===

/**
 * Validates table names against whitelist to prevent SQL injection
 * 
 * @param {&str} table - Table name to validate
 * @returns {Result<(), anyhow::Error>} Success or validation error
 * @throws {anyhow::Error} If table name is not in the whitelist
 */
fn validate_table_name(table: &str) -> Result<(), anyhow::Error> {
    if VALID_TABLES.contains(&table) {
        Ok(())
    } else {
        Err(anyhow!("Invalid table name: {}", table))
    }
}

// === EVENT REPOSITORY ===

/**
 * Repository for managing user-defined events
 * Handles CRUD operations for calendar events with proper transaction management
 */
pub struct EventRepository;

impl EventRepository {
    /**
     * Creates a new event in the database with auto-generated UUID
     * 
     * This function:
     * 1. Validates the target table name
     * 2. Generates a unique UUID for the event
     * 3. Saves the event in a database transaction
     * 4. Returns the complete event object with ID
     * 
     * @param {&str} table - Target table name (must be in VALID_TABLES)
     * @param {NewEvent} new_event - Event data without ID
     * @param {&DbPool} pool - Database connection pool
     * @returns {Result<Event, anyhow::Error>} Created event with ID or error
     * @throws {anyhow::Error} If table validation fails, database operation fails, or UUID generation fails
     */
    pub async fn save(table: &str, new_event: NewEvent, pool: &DbPool) -> Result<Event, anyhow::Error> {
        validate_table_name(table)?;
        let table = table.to_string();
        let pool = pool.clone();

        // Create complete event object with generated UUID
        let event_to_save = Event {
            id: Uuid::new_v4().to_string(),
            title: new_event.title,
            start_time: new_event.start_time,
            end_time: new_event.end_time,
            day: new_event.day,
            professor: new_event.professor,
            description: new_event.description,
        };

        let event_clone_for_thread = event_to_save.clone();
        tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
            let mut conn = pool.get()?;
            let tx = conn.transaction()?;
            Self::save_event_in_transaction(&tx, &table, &event_clone_for_thread)?;
            tx.commit()?;
            Ok(())
        }).await??;

        Ok(event_to_save)
    }

    /**
     * Updates an existing event in the database
     * 
     * @param {&str} table - Target table name
     * @param {Event} event - Complete event object with ID and updated data
     * @param {&DbPool} pool - Database connection pool
     * @returns {Result<(), anyhow::Error>} Success or error
     * @throws {anyhow::Error} If table validation fails, event not found, or database operation fails
     */
    pub async fn update(table: &str, event: Event, pool: &DbPool) -> Result<(), anyhow::Error> {
        validate_table_name(table)?;
        let table = table.to_string();
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
            let mut conn = pool.get()?;
            let tx = conn.transaction()?;
            Self::update_event_in_transaction(&tx, &table, &event)?;
            tx.commit()?;
            Ok(())
        }).await?
    }

    /**
     * Retrieves all events from the specified table
     * 
     * @param {&str} table - Source table name
     * @param {&DbPool} pool - Database connection pool
     * @returns {Result<Vec<Event>, anyhow::Error>} Array of events or error
     * @throws {anyhow::Error} If table validation fails or database query fails
     */
    pub async fn load_all(table: &str, pool: &DbPool) -> Result<Vec<Event>, anyhow::Error> {
        validate_table_name(table)?;
        let table = table.to_string();
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<Vec<Event>, anyhow::Error> {
            let conn = pool.get()?;
            let statement = format!("SELECT id, title, start_time, end_time, day, professor, description FROM {}", table);
            let mut stmt = conn.prepare(&statement)?;
            let events = stmt.query_map([], |row| {
                Ok(Event {
                    id: row.get(0)?, 
                    title: row.get(1)?, 
                    start_time: row.get(2)?,
                    end_time: row.get(3)?, 
                    day: row.get(4)?, 
                    professor: row.get(5)?,
                    description: row.get(6)?,
                })
            })?.collect::<Result<Vec<_>, _>>()?;
            Ok(events)
        }).await?
    }

    /**
     * Deletes an event by ID from the specified table
     * Simplified operation - single DELETE doesn't require transaction
     * 
     * @param {&str} table - Target table name
     * @param {String} event_id - Unique event identifier
     * @param {&DbPool} pool - Database connection pool
     * @returns {Result<(), anyhow::Error>} Success or error
     * @throws {anyhow::Error} If table validation fails or database operation fails
     */
    pub async fn delete(table: &str, event_id: String, pool: &DbPool) -> Result<(), anyhow::Error> {
        validate_table_name(table)?;
        let table = table.to_string();
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
            let conn = pool.get()?;
            let statement = format!("DELETE FROM {} WHERE id = ?1", table);
            conn.execute(&statement, params![event_id])?;
            Ok(())
        }).await?
    }

    /**
     * Internal helper: Saves an event within an existing transaction
     * Uses INSERT OR REPLACE for upsert behavior
     * 
     * @param {&Transaction} tx - Active database transaction
     * @param {&str} table - Target table name
     * @param {&Event} event - Event object to save
     * @returns {Result<(), anyhow::Error>} Success or error
     * @throws {anyhow::Error} If SQL execution fails
     */
    fn save_event_in_transaction(tx: &Transaction, table: &str, event: &Event) -> Result<(), anyhow::Error> {
        let insert_statement = format!(
            "INSERT OR REPLACE INTO {} (id, title, start_time, end_time, day, professor, description) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", 
            table
        );
        tx.execute(&insert_statement, params![
            event.id, event.title, event.start_time, event.end_time, 
            event.day, event.professor, event.description
        ])?;
        Ok(())
    }

    /**
     * Internal helper: Updates an event within an existing transaction
     * Validates that the event exists before updating
     * 
     * @param {&Transaction} tx - Active database transaction
     * @param {&str} table - Target table name
     * @param {&Event} event - Event object with updated data
     * @returns {Result<(), anyhow::Error>} Success or error
     * @throws {anyhow::Error} If event not found or SQL execution fails
     */
    fn update_event_in_transaction(tx: &Transaction, table: &str, event: &Event) -> Result<(), anyhow::Error> {
        let update_statement = format!(
            "UPDATE {} SET title = ?2, start_time = ?3, end_time = ?4, day = ?5, professor = ?6, description = ?7 WHERE id = ?1", 
            table
        );
        let rows_affected = tx.execute(&update_statement, params![
            event.id, event.title, event.start_time, event.end_time, 
            event.day, event.professor, event.description
        ])?;
        
        if rows_affected == 0 {
            return Err(anyhow!("Event with id '{}' not found", event.id));
        }
        
        Ok(())
    }
}

// === CLASS REPOSITORY ===

/**
 * Repository for managing scraped class data from university systems
 * Handles storage and retrieval of course information for schedule generation
 */
pub struct ClassRepository;

impl ClassRepository {
    /**
     * Saves multiple class groups in batch for performance
     * 
     * This function processes nested class data structure:
     * - Outer Vec: Different class groups/schedules
     * - Inner Vec: Individual classes within each group
     * - Generates composite IDs from course code, name, and sections
     * 
     * @param {&Vec<Vec<Class>>} classes - Nested array of class groups
     * @param {&DbPool} pool - Database connection pool
     * @returns {Result<(), anyhow::Error>} Success or error
     * @throws {anyhow::Error} If JSON serialization fails or database operation fails
     */
    pub async fn save_sections_batch(classes: &Vec<Vec<Class>>, pool: &DbPool) -> Result<(), anyhow::Error> {
        let classes_clone = classes.clone();
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
            let mut conn = pool.get()?;
            let tx = conn.transaction()?;
            
            let mut stmt = tx.prepare("INSERT OR REPLACE INTO classes (id, classname, data) VALUES (?, ?, ?)")?;
            
            for classes_group in classes_clone.iter() {
                for class in classes_group {
                    let json_data = serde_json::to_string(class)?;
                    // Generate composite ID: course code + name + all sections
                    let mut id = format!("{}{}", class.code, class.name);
                    for section in &class.classes {
                        id = format!("{}/{}", id, section.section);
                    }
                    let classname = format!("{}{}", class.code, class.name);
                    stmt.execute(params![id, classname, json_data])?;
                }
            }
            
            drop(stmt);
            tx.commit()?;
            Ok(())
        }).await?
    }

    /**
     * Retrieves all class sections for a specific course name
     * 
     * @param {String} name - Course name (e.g., "CSC116")
     * @param {&DbPool} pool - Database connection pool
     * @returns {Result<Vec<Class>, anyhow::Error>} Array of class objects or error
     * @throws {anyhow::Error} If database query fails or JSON deserialization fails
     */
    pub async fn get_by_name(name: String, pool: &DbPool) -> Result<Vec<Class>, anyhow::Error> {
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<Vec<Class>, anyhow::Error> {
            let conn = pool.get()?;
            let mut stmt = conn.prepare("SELECT data FROM classes WHERE classname = ?1")?;
            let classes_iter = stmt.query_map(params![name], |row| {
                let json_data: String = row.get(0)?;
                serde_json::from_str(&json_data).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
                })
            })?;
            let classes = classes_iter.collect::<Result<Vec<Class>, _>>()?;
            Ok(classes)
        }).await?
    }
}

// === CLASS PARAMETER REPOSITORY ===

/**
 * Repository for managing user-defined class parameters for schedule generation
 * Stores course codes, sections, and instructor preferences that users want to include
 */
pub struct ClassParamRepository;

impl ClassParamRepository {
    /**
     * Retrieves all class parameters from the database
     * 
     * @param {&DbPool} pool - Database connection pool
     * @returns {Result<Vec<ClassParam>, anyhow::Error>} Array of class parameters or error
     * @throws {anyhow::Error} If database query fails or JSON deserialization fails
     */
    pub async fn get_all(pool: &DbPool) -> Result<Vec<ClassParam>, anyhow::Error> {
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<Vec<ClassParam>, anyhow::Error> {
            let conn = pool.get()?;
            let mut stmt = conn.prepare("SELECT data FROM class_parameters")?;
            let rows = stmt.query_map([], |row| Ok(row.get(0)?))?;
            let mut result = Vec::new();
            for row in rows {
                let data: String = row?;
                result.push(serde_json::from_str(&data)?);
            }
            Ok(result)
        }).await?
    }

    /**
     * Updates or inserts a class parameter using upsert behavior
     * Uses transaction for consistency even though it's a single operation
     * 
     * @param {ClassParam} class - Class parameter object to save
     * @param {&DbPool} pool - Database connection pool
     * @returns {Result<(), anyhow::Error>} Success or error
     * @throws {anyhow::Error} If JSON serialization fails or database operation fails
     */
    pub async fn update(class: ClassParam, pool: &DbPool) -> Result<(), anyhow::Error> {
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
            let mut conn = pool.get()?;
            let tx = conn.transaction()?;
            
            let id = class.id.clone();
            let json_data = serde_json::to_string(&class)?;
            tx.execute("INSERT OR REPLACE INTO class_parameters (id, data) VALUES (?, ?)", params![id, json_data])?;
            
            tx.commit()?;
            Ok(())
        }).await?
    }

    /**
     * Removes a class parameter by ID
     * Simplified operation - single DELETE doesn't require transaction
     * 
     * @param {String} id - Unique class parameter identifier
     * @param {&DbPool} pool - Database connection pool
     * @returns {Result<(), anyhow::Error>} Success or error
     * @throws {anyhow::Error} If database operation fails
     */
    pub async fn remove(id: String, pool: &DbPool) -> Result<(), anyhow::Error> {
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
            let conn = pool.get()?;
            conn.execute("DELETE FROM class_parameters WHERE id=?1", params![id])?;
            Ok(())
        }).await?
    }
}

// === SCHEDULE REPOSITORY ===

/**
 * Repository for managing generated schedules and their combinations
 * Handles both regular schedules and favorites with proper batch operations
 */
pub struct ScheduleRepository;

impl ScheduleRepository {
    /**
     * Retrieves all schedules from the specified table
     * 
     * @param {&str} table - Source table name ("schedules" or "favorites")
     * @param {&DbPool} pool - Database connection pool
     * @returns {Result<Vec<Vec<Class>>, anyhow::Error>} Array of schedule combinations or error
     * @throws {anyhow::Error} If table validation fails, database query fails, or JSON deserialization fails
     */
    pub async fn get_all(table: &str, pool: &DbPool) -> Result<Vec<Vec<Class>>, anyhow::Error> {
        validate_table_name(table)?;
        let table = table.to_string();
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<Vec<Vec<Class>>, anyhow::Error> {
            let conn = pool.get()?;
            let prepared_statement = format!("SELECT data FROM {}", table);
            let mut stmt = conn.prepare(&prepared_statement)?;
            let rows = stmt.query_map([], |row| Ok(row.get(0)?))?;
            let mut result = Vec::new();
            for row in rows {
                let data: String = row?;
                result.push(serde_json::from_str(&data)?);
            }
            Ok(result)
        }).await?
    }

    /**
     * Saves multiple schedules in batch with atomic transaction
     * 
     * This function performs a complete replacement of the schedules table:
     * 1. Deletes all existing schedules
     * 2. Inserts new schedules in batches for performance
     * 3. Uses transaction to ensure atomicity
     * 
     * @param {Vec<String>} ids - Array of unique schedule identifiers
     * @param {&Vec<Vec<Class>>} schedules - Array of schedule combinations
     * @param {&DbPool} pool - Database connection pool
     * @returns {Result<(), anyhow::Error>} Success or error
     * @throws {anyhow::Error} If JSON serialization fails or database operation fails
     */
    pub async fn save_batch(ids: Vec<String>, schedules: &Vec<Vec<Class>>, pool: &DbPool) -> Result<(), anyhow::Error> {
        let schedules_clone = schedules.clone();
        let ids_clone = ids.clone();
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
            let mut conn = pool.get()?;
            let tx = conn.transaction()?;
            
            // Clear existing schedules
            tx.execute("DELETE FROM schedules", [])?;
            
            // Insert new schedules in batches
            let mut stmt = tx.prepare("INSERT INTO schedules (id, data) VALUES (?1, ?2)")?;
            for chunk_data in ids_clone.chunks(BATCH_SIZE).zip(schedules_clone.chunks(BATCH_SIZE)) {
                let (id_chunk, schedule_chunk) = chunk_data;
                for (id, schedule) in id_chunk.iter().zip(schedule_chunk.iter()) {
                    let json_data = serde_json::to_string(schedule)?;
                    stmt.execute(params![id, json_data])?;
                }
            }
            
            drop(stmt);
            tx.commit()?;
            Ok(())
        }).await?
    }

    /**
     * Deletes a specific schedule by ID
     * Simplified operation - single DELETE doesn't require transaction
     * 
     * @param {String} id - Unique schedule identifier
     * @param {&DbPool} pool - Database connection pool
     * @returns {Result<(), anyhow::Error>} Success or error
     * @throws {anyhow::Error} If database operation fails
     */
    pub async fn delete(id: String, pool: &DbPool) -> Result<(), anyhow::Error> {
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
            let conn = pool.get()?;
            conn.execute("DELETE FROM schedules WHERE id = ?1", params![id])?;
            Ok(())
        }).await?
    }
}

// === FAVORITES REPOSITORY ===

/**
 * Repository for managing user-favorited schedules
 * Provides toggle functionality for adding/removing favorites
 */
pub struct FavoriteRepository;

impl FavoriteRepository {
    /**
     * Changes the favorite status of a schedule (add or remove)
     * 
     * This function provides toggle behavior:
     * - If schedule is provided: adds to favorites
     * - If schedule is None: removes from favorites
     * Uses transaction to ensure atomic operation
     * 
     * @param {String} id - Unique schedule identifier
     * @param {Option<Vec<Class>>} schedule - Schedule data to add (None to remove)
     * @param {&DbPool} pool - Database connection pool
     * @returns {Result<(), anyhow::Error>} Success or error
     * @throws {anyhow::Error} If JSON serialization fails or database operation fails
     */
    pub async fn change_status(id: String, schedule: Option<Vec<Class>>, pool: &DbPool) -> Result<(), anyhow::Error> {
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
            let mut conn = pool.get()?;
            let tx = conn.transaction()?;
            
            match schedule {
                Some(schedule_unwrapped) => {
                    // Add to favorites
                    let json_data = serde_json::to_string(&schedule_unwrapped)?;
                    tx.execute("INSERT OR REPLACE INTO favorites (id, data) VALUES (?1, ?2)", params![id, json_data])?;
                },
                None => {
                    // Remove from favorites
                    tx.execute("DELETE FROM favorites WHERE id = ?1", params![id])?;
                },
            };
            
            tx.commit()?;
            Ok(())
        }).await?
    }
}

// === SYSTEM REPOSITORY ===

/**
 * Repository for managing system configuration and application state
 * Handles Chrome version tracking and selected schedule persistence
 */
pub struct SystemRepository;

impl SystemRepository {
    /**
     * Updates the Chrome version in system configuration
     * Simplified operation - single UPDATE doesn't require transaction
     * 
     * @param {String} version - New Chrome version string
     * @param {&DbPool} pool - Database connection pool
     * @returns {Result<(), anyhow::Error>} Success or error
     * @throws {anyhow::Error} If database operation fails
     */
    pub async fn update_version(version: String, pool: &DbPool) -> Result<(), anyhow::Error> {
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
            let conn = pool.get()?;
            conn.execute("UPDATE data SET version = ?1 WHERE id = ?2", params![version, DATA_TABLE_ID])?;
            Ok(())
        }).await?
    }

    /**
     * Retrieves the currently selected/pinned schedule index
     * 
     * @param {&DbPool} pool - Database connection pool
     * @returns {Result<Option<i16>, anyhow::Error>} Schedule index or None if no schedule selected
     * @throws {anyhow::Error} If database query fails
     */
    pub async fn get_display_schedule(pool: &DbPool) -> Result<Option<i16>, anyhow::Error> {
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<Option<i16>, anyhow::Error> {
            let conn = pool.get()?;
            let id: Option<i16> = conn.query_row(
                "SELECT schedule FROM data WHERE id = ?1", 
                params![DATA_TABLE_ID], 
                |row| row.get(0)
            ).optional()?.flatten();
            Ok(id)
        }).await?
    }

    /**
     * Sets the currently selected/pinned schedule index
     * Simplified operation - single UPDATE doesn't require transaction
     * 
     * @param {Option<i16>} id - Schedule index to pin, or None to unpin
     * @param {&DbPool} pool - Database connection pool
     * @returns {Result<(), anyhow::Error>} Success or error
     * @throws {anyhow::Error} If database operation fails
     */
    pub async fn set_display_schedule(id: Option<i16>, pool: &DbPool) -> Result<(), anyhow::Error> {
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
            let conn = pool.get()?;
            conn.execute("UPDATE data SET schedule = ?1 WHERE id = ?2", params![id, DATA_TABLE_ID])?;
            Ok(())
        }).await?
    }
}

// === DATABASE INITIALIZATION ===

/**
 * Initializes the database schema with all required tables and indexes
 * 
 * Creates the following tables:
 * - data: System configuration (Chrome version, OS, selected schedule)
 * - events: User-defined calendar events
 * - favorites: User-favorited schedules
 * - schedules: Generated schedule combinations
 * - class_parameters: User-defined course parameters for generation
 * - classes: Scraped course data from university systems
 * 
 * Also creates performance indexes on frequently queried columns.
 * 
 * @param {&DbPool} pool - Database connection pool
 * @returns {Result<(), anyhow::Error>} Success or error
 * @throws {anyhow::Error} If database schema creation fails
 */
pub fn initialize_database(pool: &DbPool) -> Result<(), anyhow::Error> {
    let conn = pool.get()?;
    conn.execute_batch(
        "BEGIN;
        CREATE TABLE IF NOT EXISTS data (
            id SMALLINT PRIMARY KEY, 
            version TEXT, 
            os TEXT, 
            schedule SMALLINT
        );
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY, 
            title TEXT NOT NULL, 
            start_time INTEGER NOT NULL,
            end_time INTEGER NOT NULL, 
            day INTEGER NOT NULL, 
            professor TEXT, 
            description TEXT
        );
        CREATE TABLE IF NOT EXISTS favorites (
            id TEXT PRIMARY KEY, 
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS schedules (
            id TEXT PRIMARY KEY, 
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS class_parameters (
            id TEXT PRIMARY KEY, 
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS classes (
            id TEXT PRIMARY KEY, 
            classname TEXT NOT NULL, 
            data TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_classes_classname ON classes(classname);
        CREATE INDEX IF NOT EXISTS idx_events_day ON events(day);
        COMMIT;"
    )?;
    Ok(())
}

// === CONNECTION INFO MANAGEMENT ===

/**
 * Loads or creates system connection information for Chrome management
 * 
 * This function handles the initial setup of system configuration:
 * 1. Attempts to load existing connection info from database
 * 2. If not found, creates initial record with provided OS information
 * 3. Returns ConnectInfo struct for Chrome version management
 * 
 * Simplified operation - uses optional insert pattern instead of transaction
 * 
 * @param {&DbPool} pool - Database connection pool
 * @param {String} os - Operating system string for Chrome downloads
 * @returns {Result<ConnectInfo, anyhow::Error>} Connection info or error
 * @throws {anyhow::Error} If database operations fail
 */
pub fn load_connect_info(pool: &DbPool, os: String) -> Result<ConnectInfo, anyhow::Error> {
    let conn = pool.get()?;
    
    let connect_info = conn.query_row(
        "SELECT version, os FROM data WHERE id = ?1",
        params![DATA_TABLE_ID],
        |row| Ok(ConnectInfo {
            version: row.get(0)?,
            os: row.get(1)?,
        })
    ).optional()?;

    match connect_info {
        Some(info) => {
            println!("Loaded connect info from DB: version={}, os={}", info.version, info.os);
            Ok(info)
        },
        None => {
            println!("No connect info in DB. Inserting initial data for os: {}", os);
            conn.execute(
                "INSERT INTO data (id, os, version, schedule) VALUES (?1, ?2, '', NULL)", 
                params![DATA_TABLE_ID, &os]
            )?;
            Ok(ConnectInfo { os, version: String::new() })
        }
    }
}