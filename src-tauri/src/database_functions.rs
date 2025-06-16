use crate::{Class, ClassParam, ConnectInfo, DbPool};
use anyhow::anyhow;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

const TABLENAMES: [&str; 4] = ["calendar", "scheduler", "combinations", "favorites"];

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

pub fn initialize_database(pool: &DbPool) -> Result<(), anyhow::Error> {
    let conn = pool.get()?;
    conn.execute_batch(
        "BEGIN;
        CREATE TABLE IF NOT EXISTS data (
            id SMALLINT PRIMARY KEY, 
            version TINYTEXT, 
            os TINYTEXT, 
            schedule SMALLINT
        );
        CREATE TABLE IF NOT EXISTS calendar (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, start_time INTEGER NOT NULL,
            end_time INTEGER NOT NULL, day INTEGER NOT NULL, professor TEXT, description TEXT
        );
        CREATE TABLE IF NOT EXISTS scheduler (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, start_time INTEGER NOT NULL,
            end_time INTEGER NOT NULL, day INTEGER NOT NULL, professor TEXT, description TEXT
        );
        CREATE TABLE IF NOT EXISTS favorites (id STRING PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS combinations (id STRING PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS class_parameters (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS classes (
            id TEXT PRIMARY KEY, classname TEXT NOT NULL, data TEXT NOT NULL
        );
        COMMIT;"
    )?;
    Ok(())
}

pub fn load_connect_info(pool: &DbPool, os: String) -> Result<ConnectInfo, anyhow::Error> {
    let conn = pool.get()?;
    
    let connect_info = conn.query_row(
        "SELECT version, os FROM data WHERE id = 0",
        [],
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
                "INSERT INTO data (id, os, version, schedule) VALUES (0, ?1, '', NULL)", 
                params![&os]
            )?;
            Ok(ConnectInfo { os, version: String::new() })
        }
    }
}

pub async fn save_event(table: String, event: Event, pool: &DbPool) -> Result<(), anyhow::Error> {
    let pool = pool.clone();
    tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
        let conn = pool.get()?;
        let table_name = TABLENAMES.iter().find(|&&s| s == table).ok_or_else(|| anyhow!("Invalid table name"))?;
        let insert_statement = format!("INSERT OR REPLACE INTO {} (id, title, start_time, end_time, day, professor, description) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", table_name);
        conn.execute(&insert_statement, params![event.id, event.title, event.start_time, event.end_time, event.day, event.professor, event.description])?;
        Ok(())
    }).await?
}

pub async fn load_events(table: String, pool: &DbPool) -> Result<Vec<Event>, anyhow::Error> {
    let pool = pool.clone();
    tokio::task::spawn_blocking(move || -> Result<Vec<Event>, anyhow::Error> {
        let conn = pool.get()?;
        let table_name = TABLENAMES.iter().find(|&&s| s == table).ok_or_else(|| anyhow!("Invalid table name"))?;
        let statement = format!("SELECT id, title, start_time, end_time, day, professor, description FROM {}", table_name);
        let mut stmt = conn.prepare(&statement)?;
        let events = stmt.query_map([], |row| {
            Ok(Event {
                id: row.get(0)?, title: row.get(1)?, start_time: row.get(2)?,
                end_time: row.get(3)?, day: row.get(4)?, professor: row.get(5)?,
                description: row.get(6)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(events)
    }).await?
}

pub async fn update_db_version(version: String, pool: &DbPool) -> Result<(), anyhow::Error> {
    let pool = pool.clone();
    tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
        let conn = pool.get()?;
        conn.execute("UPDATE data SET version = ?1 WHERE id = 0", params![version])?;
        Ok(())
    }).await?
}

pub async fn get_display_schedule(pool: &DbPool) -> Result<Option<i16>, anyhow::Error> {
    let pool = pool.clone();
    tokio::task::spawn_blocking(move || -> Result<Option<i16>, anyhow::Error> {
        let conn = pool.get()?;
        let id: Option<i16> = conn.query_row("SELECT schedule FROM data WHERE id = 0", [], |row| row.get(0)).optional()?.flatten();
        Ok(id)
    }).await?
}

pub async fn set_display_schedule(id: Option<i16>, pool: &DbPool) -> Result<(), anyhow::Error> {
    let pool = pool.clone();
    tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
        let conn = pool.get()?;
        conn.execute("UPDATE data SET schedule = ?1 WHERE id = 0", params![id])?;
        Ok(())
    }).await?
}

pub async fn save_class_sections(classes: &Vec<Vec<Class>>, pool: &DbPool) -> Result<(), anyhow::Error> {
    let classes_clone = classes.clone();
    let pool = pool.clone();
    tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
        let mut conn = pool.get()?;
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare("INSERT OR REPLACE INTO classes (id, classname, data) VALUES (?, ?, ?)")?;
            for classes in classes_clone.iter() {
                for class in classes {
                    let json_data = serde_json::to_string(class)?;
                    let mut id = format!("{}{}", class.code, class.name);
                    for section in &class.classes {
                        id = format!("{}/{}", id, section.section);
                    }
                    let classname = format!("{}{}", class.code, class.name);
                    stmt.execute(params![id, classname, json_data])?;
                }
            }
        }
        tx.commit()?;
        Ok(())
    }).await?
}

pub async fn get_class_by_name(name: String, pool: &DbPool) -> Result<Vec<Class>, anyhow::Error> {
    let pool = pool.clone();
    tokio::task::spawn_blocking(move || -> Result<Vec<Class>, anyhow::Error> {
        let conn = pool.get()?;
        let mut stmt = conn.prepare("SELECT data FROM classes WHERE classname = ?1")?;
        let classes_iter = stmt.query_map(params![name], |row| {
            let json_data: String = row.get(0)?;
            serde_json::from_str(&json_data).map_err(|e| rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e)))
        })?;
        let classes = classes_iter.collect::<Result<Vec<Class>, _>>()?;
        Ok(classes)
    }).await?
}

pub async fn get_parameter_classes(pool: &DbPool) -> Result<Vec<ClassParam>, anyhow::Error> {
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

pub async fn update_parameter_classes(class: ClassParam, pool: &DbPool) -> Result<(), anyhow::Error> {
    let pool = pool.clone();
    tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
        let mut conn = pool.get()?;
        let tx = conn.transaction()?;
        {
            let id = class.id.clone();
            let json_data = serde_json::to_string(&class)?;
            let mut stmt = tx.prepare("INSERT OR REPLACE INTO class_parameters (id, data) VALUES (?, ?)")?;
            stmt.execute(params![id, json_data])?;
        }
        tx.commit()?;
        Ok(())
    }).await?
}

pub async fn remove_parameter_class(id: String, pool: &DbPool) -> Result<(), anyhow::Error> {
    let pool = pool.clone();
    tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
        let conn = pool.get()?;
        conn.execute("DELETE FROM class_parameters WHERE id=?1", params![id])?;
        Ok(())
    }).await?
}

pub async fn get_combinations(table: String, pool: &DbPool) -> Result<Vec<Vec<Class>>, anyhow::Error> {
    let pool = pool.clone();
    tokio::task::spawn_blocking(move || -> Result<Vec<Vec<Class>>, anyhow::Error> {
        let conn = pool.get()?;
        let table_name = TABLENAMES.iter().find(|&&s| s == table).ok_or_else(|| anyhow!("Invalid table name"))?;
        let prepared_statement = format!("SELECT data FROM {}", table_name);
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

pub async fn save_combinations_backend(ids: Vec<String>, combinations: &Vec<Vec<Class>>, pool: &DbPool) -> Result<(), anyhow::Error> {
    let combinations_clone = combinations.clone();
    let ids_clone = ids.clone();
    let pool = pool.clone();
    tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
        let mut conn = pool.get()?;
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM combinations", [])?;
        {
            let mut stmt = tx.prepare("INSERT INTO combinations (id, data) VALUES (?1, ?2)")?;
            for (i, combination) in combinations_clone.iter().enumerate() {
                let json_data = serde_json::to_string(combination)?;
                stmt.execute(params![ids_clone[i], json_data])?;
            }
        }
        tx.commit()?;
        Ok(())
    }).await?
}

pub async fn delete_combination_backend(id: String, pool: &DbPool) -> Result<(), anyhow::Error> {
    let pool = pool.clone();
    tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
        let conn = pool.get()?;
        conn.execute("DELETE FROM combinations WHERE id = ?1", params![id])?;
        Ok(())
    }).await?
}

pub async fn delete_events(table: String, event_id: String, pool: &DbPool) -> Result<(), anyhow::Error> {
    let pool = pool.clone();
    tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
        let conn = pool.get()?;
        let table_name = TABLENAMES.iter().find(|&&s| s == table).ok_or_else(|| anyhow!("Invalid table name"))?;
        let statement = format!("DELETE FROM {} WHERE id = ?1", table_name);
        conn.execute(&statement, params![event_id])?;
        Ok(())
    }).await?
}

pub async fn change_favorite_status(id: String, schedule: Option<Vec<Class>>, pool: &DbPool) -> Result<(), anyhow::Error> {
    let pool = pool.clone();
    tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
        let conn = pool.get()?;
        match schedule {
            Some(schedule_unwrapped) => {
                let json_data = serde_json::to_string(&schedule_unwrapped)?;
                conn.execute("INSERT OR REPLACE INTO favorites (id, data) VALUES (?1, ?2)", params![id, json_data])?;
            },
            None => {
                conn.execute("DELETE FROM favorites WHERE id = ?1", params![id])?;
            },
        };
        Ok(())
    }).await?
}