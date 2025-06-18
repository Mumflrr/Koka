use crate::{Class, ClassParam, ConnectInfo, DbPool};
use anyhow::anyhow;
use rusqlite::{params, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};

// Configuration constants
const DATA_TABLE_ID: i32 = 0;
const BATCH_SIZE: usize = 100;

// Valid table names
const VALID_TABLES: &[&str] = &["events", "schedules", "favorites"];

fn validate_table_name(table: &str) -> Result<(), anyhow::Error> {
    if VALID_TABLES.contains(&table) {
        Ok(())
    } else {
        Err(anyhow!("Invalid table name: {}", table))
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Event {
    pub id: String,
    pub title: String,
    #[serde(rename = "startTime")]
    pub start_time: i32,
    #[serde(rename = "endTime")]
    pub end_time: i32,
    pub day: i32,
    pub professor: String,
    pub description: String,
}

// Repository for Event operations
pub struct EventRepository;

impl EventRepository {
    pub async fn save(table: &str, event: Event, pool: &DbPool) -> Result<(), anyhow::Error> {
        validate_table_name(table)?;
        let table = table.to_string();
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
            let mut conn = pool.get()?;
            let tx = conn.transaction()?;
            Self::save_event_in_transaction(&tx, &table, &event)?;
            tx.commit()?;
            Ok(())
        }).await?
    }

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

    // Simplified - single DELETE doesn't need transaction
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
}

// Repository for Class operations
pub struct ClassRepository;

impl ClassRepository {
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

    // Simplified read operation
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

// Repository for ClassParam operations
pub struct ClassParamRepository;

impl ClassParamRepository {
    // Simplified read operation
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

    // Keep transaction for consistency
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

    // Simplified - single DELETE doesn't need transaction
    pub async fn remove(id: String, pool: &DbPool) -> Result<(), anyhow::Error> {
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
            let conn = pool.get()?;
            conn.execute("DELETE FROM class_parameters WHERE id=?1", params![id])?;
            Ok(())
        }).await?
    }
}

// Repository for Schedule operations (formerly Combinations)
pub struct ScheduleRepository;

impl ScheduleRepository {
    // Simplified read operation
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

    // Keep transaction - DELETE + multiple INSERTs need to be atomic
    pub async fn save_batch(ids: Vec<String>, schedules: &Vec<Vec<Class>>, pool: &DbPool) -> Result<(), anyhow::Error> {
        let schedules_clone = schedules.clone();
        let ids_clone = ids.clone();
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
            let mut conn = pool.get()?;
            let tx = conn.transaction()?;
            
            tx.execute("DELETE FROM schedules", [])?;
            
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

    // Simplified - single DELETE doesn't need transaction
    pub async fn delete(id: String, pool: &DbPool) -> Result<(), anyhow::Error> {
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
            let conn = pool.get()?;
            conn.execute("DELETE FROM schedules WHERE id = ?1", params![id])?;
            Ok(())
        }).await?
    }
}

// Repository for Favorites operations
pub struct FavoriteRepository;

impl FavoriteRepository {
    // Keep transaction - conditional INSERT/DELETE should be atomic
    pub async fn change_status(id: String, schedule: Option<Vec<Class>>, pool: &DbPool) -> Result<(), anyhow::Error> {
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
            let mut conn = pool.get()?;
            let tx = conn.transaction()?;
            
            match schedule {
                Some(schedule_unwrapped) => {
                    let json_data = serde_json::to_string(&schedule_unwrapped)?;
                    tx.execute("INSERT OR REPLACE INTO favorites (id, data) VALUES (?1, ?2)", params![id, json_data])?;
                },
                None => {
                    tx.execute("DELETE FROM favorites WHERE id = ?1", params![id])?;
                },
            };
            
            tx.commit()?;
            Ok(())
        }).await?
    }
}

// Repository for System/Data operations
pub struct SystemRepository;

impl SystemRepository {
    // Simplified - single UPDATE doesn't need transaction
    pub async fn update_version(version: String, pool: &DbPool) -> Result<(), anyhow::Error> {
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
            let conn = pool.get()?;
            conn.execute("UPDATE data SET version = ?1 WHERE id = ?2", params![version, DATA_TABLE_ID])?;
            Ok(())
        }).await?
    }

    // Simplified read operation
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

    // Simplified - single UPDATE doesn't need transaction
    pub async fn set_display_schedule(id: Option<i16>, pool: &DbPool) -> Result<(), anyhow::Error> {
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
            let conn = pool.get()?;
            conn.execute("UPDATE data SET schedule = ?1 WHERE id = ?2", params![id, DATA_TABLE_ID])?;
            Ok(())
        }).await?
    }
}

// Database initialization and connection info functions
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

// Simplified - no transaction needed for single query + optional insert
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
/* 
// Legacy function wrappers for backward compatibility
pub async fn save_event(table: String, event: Event, pool: &DbPool) -> Result<(), anyhow::Error> {
    EventRepository::save(&table, event, pool).await
}

pub async fn load_events(table: String, pool: &DbPool) -> Result<Vec<Event>, anyhow::Error> {
    EventRepository::load_all(&table, pool).await
}

pub async fn delete_events(table: String, event_id: String, pool: &DbPool) -> Result<(), anyhow::Error> {
    EventRepository::delete(&table, event_id, pool).await
}

pub async fn update_db_version(version: String, pool: &DbPool) -> Result<(), anyhow::Error> {
    SystemRepository::update_version(version, pool).await
}

pub async fn get_display_schedule(pool: &DbPool) -> Result<Option<i16>, anyhow::Error> {
    SystemRepository::get_display_schedule(pool).await
}

pub async fn set_display_schedule(id: Option<i16>, pool: &DbPool) -> Result<(), anyhow::Error> {
    SystemRepository::set_display_schedule(id, pool).await
}

pub async fn save_class_sections(classes: &Vec<Vec<Class>>, pool: &DbPool) -> Result<(), anyhow::Error> {
    ClassRepository::save_sections_batch(classes, pool).await
}

pub async fn get_class_by_name(name: String, pool: &DbPool) -> Result<Vec<Class>, anyhow::Error> {
    ClassRepository::get_by_name(name, pool).await
}

pub async fn get_parameter_classes(pool: &DbPool) -> Result<Vec<ClassParam>, anyhow::Error> {
    ClassParamRepository::get_all(pool).await
}

pub async fn update_parameter_classes(class: ClassParam, pool: &DbPool) -> Result<(), anyhow::Error> {
    ClassParamRepository::update(class, pool).await
}

pub async fn remove_parameter_class(id: String, pool: &DbPool) -> Result<(), anyhow::Error> {
    ClassParamRepository::remove(id, pool).await
}

pub async fn get_schedules(table: String, pool: &DbPool) -> Result<Vec<Vec<Class>>, anyhow::Error> {
    ScheduleRepository::get_all(&table, pool).await
}

pub async fn save_schedules_backend(ids: Vec<String>, schedules: &Vec<Vec<Class>>, pool: &DbPool) -> Result<(), anyhow::Error> {
    ScheduleRepository::save_batch(ids, schedules, pool).await
}

pub async fn delete_schedule_backend(id: String, pool: &DbPool) -> Result<(), anyhow::Error> {
    ScheduleRepository::delete(id, pool).await
}

pub async fn change_favorite_status(id: String, schedule: Option<Vec<Class>>, pool: &DbPool) -> Result<(), anyhow::Error> {
    FavoriteRepository::change_status(id, schedule, pool).await
} */