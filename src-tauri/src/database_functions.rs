use rusqlite::{params, Connection};
use serde::{Serialize, Deserialize};
use crate::{get_version, ConnectInfo};

#[derive(Serialize, Deserialize, Clone)]
pub struct Event {
    pub id: i32,
    pub title: String,
    #[serde(rename = "startTime")]
    pub start_time: String,
    #[serde(rename = "endTime")]
    pub end_time: String,
    pub day: i32,
    pub professor: String,
    pub description: String,
}

pub async fn setup_database(os_info: ConnectInfo) -> Result<ConnectInfo, anyhow::Error> {
    // Open database file
    let conn = Connection::open("programData.db")?;

    // Create table if need be
    conn.execute(
        "CREATE TABLE IF NOT EXISTS data (id SMALLINT, version TINYTEXT, os TINYTEXT)",
        (),
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            day INTEGER NOT NULL,
            professor TEXT,
            description TEXT
        )",
        (),
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS scheduler (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            day INTEGER NOT NULL,
            professor TEXT,
            description TEXT
        )",
        (),
    )?;

    // Pre-allocate struct and prepare statement
    let mut connect_info: ConnectInfo;
    let mut stmt = conn.prepare("SELECT version, os FROM data WHERE id = 0")?;

    // Run statement and try to save result into a struct
    // If successful then save the resulting struct into the pre-allocated struct
    // If an error is thrown because there is no table, then save os_info and get version
    match stmt.query_row([], |row| {
        Ok(ConnectInfo {
            version: row.get(0)?,
            os: row.get(1)?,
        })
    }) {
        Ok(result_struct) => connect_info = result_struct,
        Err(_) => {
            // Save OS information to the database
            conn.execute(
                "INSERT INTO data (id, os) VALUES (0, ?1)",
                params![os_info.os],
            )?;
            
            connect_info = os_info;
            get_version(&mut connect_info).await?;
        }
    }

    println!("Retrieved data: {}, {}", connect_info.os, connect_info.version);

    Ok(connect_info)
}

// Separate function for database operations to keep concerns modular
pub async fn update_db_version(version: String) -> Result<(), anyhow::Error> {
    // Spawn a blocking task since SQLite operations are synchronous
    tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
        // Open connection to SQLite database
        let conn = Connection::open("programData.db")?;
        
        // Execute the update query with the new version
        conn.execute(
            "UPDATE data SET version = ?1 WHERE id = 0", 
            params![version]
        )?;
        
        Ok(())
    }).await? // Handle both the JoinError and the Result
}


pub async fn save_calendar_events(events: Vec<Event>) -> Result<(), anyhow::Error> {
    tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
        let conn = Connection::open("programData.db")?;
        
        // Clear existing events
        conn.execute("DELETE FROM events", [])?;
        
        // Insert new events
        for event in events {
            conn.execute(
                "INSERT INTO events (id, title, start_time, end_time, day, professor, description) 
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    event.id,
                    event.title,
                    event.start_time,
                    event.end_time,
                    event.day,
                    event.professor,
                    event.description
                ],
            )?;
        }
        
        Ok(())
    }).await?
}

pub async fn load_calendar_events() -> Result<Vec<Event>, anyhow::Error> {
    tokio::task::spawn_blocking(|| -> Result<Vec<Event>, anyhow::Error> {
        let conn = Connection::open("programData.db")?;
        let mut stmt = conn.prepare(
            "SELECT id, title, start_time, end_time, day, professor, description FROM events"
        )?;
        
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
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(events)
    }).await?
}

pub async fn delete_calendar_events(event_id: i32) -> Result<(), anyhow::Error> {
    tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
        let conn = Connection::open("programData.db")?;
        conn.execute(
            "DELETE FROM events WHERE id = ?1",
            params![event_id],
        )?;
        Ok(())
    }).await?
}


pub async fn save_scheduler_events(events: Vec<Event>) -> Result<(), anyhow::Error> {
    tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
        let conn = Connection::open("programData.db")?;
        
        // Clear existing events
        conn.execute("DELETE FROM scheduler", [])?;
        
        // Insert new events
        for event in events {
            conn.execute(
                "INSERT INTO scheduler (id, title, start_time, end_time, day, professor, description) 
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    event.id,
                    event.title,
                    event.start_time,
                    event.end_time,
                    event.day,
                    event.professor,
                    event.description
                ],
            )?;
        }
        
        Ok(())
    }).await?
}

pub async fn load_scheduler_events() -> Result<Vec<Event>, anyhow::Error> {
    tokio::task::spawn_blocking(|| -> Result<Vec<Event>, anyhow::Error> {
        let conn = Connection::open("programData.db")?;
        let mut stmt = conn.prepare(
            "SELECT id, title, start_time, end_time, day, professor, description FROM scheduler"
        )?;
        
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
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(events)
    }).await?
}

pub async fn delete_scheduler_events(event_id: i32) -> Result<(), anyhow::Error> {
    tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
        let conn = Connection::open("programData.db")?;
        conn.execute(
            "DELETE FROM scheduler WHERE id = ?1",
            params![event_id],
        )?;
        Ok(())
    }).await?
}