use rusqlite::{params, Connection};
use serde::{Serialize, Deserialize};
use anyhow::anyhow;
use crate::{get_version, Class, ConnectInfo};

const TABLENAMES: [&str; 4] = ["calendar", "scheduler", "combinations", "favorites"];

#[derive(Serialize, Deserialize, Clone)]
pub struct Event {
    pub id: String,
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
        "CREATE TABLE IF NOT EXISTS data (
            id SMALLINT, 
            version TINYTEXT, 
            os TINYTEXT, 
            schedule SMALLINT
        )",
        (),
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS calendar (
            id TEXT PRIMARY KEY,
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
            id TEXT PRIMARY KEY,
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
        "CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY,
            data TEXT NOT NULL
        )",
        ()
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS combinations (
            id INTEGER PRIMARY KEY,
            data TEXT NOT NULL
        )",
        (),
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS class_parameters (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL
        )",
        ()
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS classes (
            id TEXT PRIMARY KEY,
            classname TEXT NOT NULL,
            data TEXT NOT NULL
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
            conn.execute("INSERT INTO data (id, os) VALUES (0, ?1)", params![os_info.os])?;

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
        conn.execute("UPDATE data SET version = ?1 WHERE id = 0", params![version])?;

        Ok(())
    }).await?
}

pub async fn save_class_sections(classes: &Vec<Vec<Class>>) -> Result<(), anyhow::Error> {
        // Clone classes to move into the spawn_blocking closure
        let classes_clone = classes.clone();

        tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
            let mut conn = Connection::open("programData.db")?;

            // Begin a transaction for better performance with batch operations
            let tx = conn.transaction()?;

            {
                // Prepare the statement once outside the loop for efficiency
                let mut stmt = tx.prepare("INSERT OR REPLACE INTO classes (id, classname, data) VALUES (?, ?, ?)")?;

                // Insert each combination as a separate row
                for classes in classes_clone.iter() {
                    for class in classes {
                        // Serialize the section to JSON
                        let json_data = serde_json::to_string(class)?;
                        // Make id name
                        let mut id = format!("{}{}", class.code, class.name);

                        for section in &class.classes {
                            id = format!("{}/{}", id, section.section);
                        }

                        let classname = format!("{}{}", class.code, class.name);

                        // Execute the prepared statement
                        stmt.execute(params![id, classname, json_data])?;
                    }
                }
            } // The borrow of `tx` by `stmt` ends here

            // Commit the transaction
            tx.commit()?;

            Ok(())
        }).await?
}


pub async fn get_class_by_name(name: String) -> Result<Vec<Class>, anyhow::Error> {
    // Spawn a blocking task since SQLite operations are synchronous
    let result = tokio::task::spawn_blocking(move || -> Result<Vec<Class>, anyhow::Error> {
        // Open connection to SQLite database
        let conn = Connection::open("programData.db")?;

        // Simplified concept
        let mut stmt = conn.prepare("SELECT data FROM classes WHERE classname = ?1")?;
        let raw_json_iter = stmt.query_map(params![name], |row| row.get::<usize, String>(0))?; // Get only strings

        let mut classes: Vec<Class> = Vec::new();
        // This collect forces fetching all strings into memory first
        let all_raw_json: Vec<String> = raw_json_iter.collect::<Result<Vec<_>, _>>()?;

        // Now, map in Rust after DB interaction is done
        for json_data in all_raw_json {
            // Error handling here is simpler - can just use anyhow::Error directly
            let class: Class = serde_json::from_str(&json_data)?; // Or .map_err(anyhow::Error::from)
            classes.push(class);
        }
        // 'classes' now holds the result

        Ok(classes)
    }).await??; // First '?' handles JoinError, second '?' handles the inner anyhow::Error

    Ok(result)
}

pub async fn get_parameter_classes() -> Result<Vec<Class>, anyhow::Error> {
    tokio::task::spawn_blocking(move || -> Result<Vec<Class>, anyhow::Error> {
        let conn = Connection::open("programData.db")?;

        let prepared_statement = format!("SELECT data FROM class_parameters");
        let mut stmt = conn.prepare(&prepared_statement)?;

        // Query rows and map each row to a Vec<Class>
        let rows = stmt.query_map([], |row| {
            let data: String = row.get(0)?;
            Ok(data) // Just return the string for now
        })?;

        // Collect the results and handle deserialization separately
        let mut result = Vec::new();
        for row in rows {
            let data = row?;
            let class: Class = serde_json::from_str(&data)
                .map_err(|e| anyhow::anyhow!("Unable to deserialize class: {}", e))?;
            result.push(class);
        }

        Ok(result)
    }).await?
}

pub async fn get_combinations(table: String) -> Result<Vec<Vec<Class>>, anyhow::Error> {
    tokio::task::spawn_blocking(move || -> Result<Vec<Vec<Class>>, anyhow::Error> {
        let conn = Connection::open("programData.db")?;

        let index = match TABLENAMES.iter().position(|s| *s == table) {
            Some(index) => index,
            None => return Err(anyhow!("Unable to find table")),
        };

        let prepared_statement = format!("SELECT data FROM {}", TABLENAMES[index]);
        let mut stmt = conn.prepare(&prepared_statement)?;

        // Query rows and map each row to a Vec<Class>
        let rows = stmt.query_map([], |row| {
            let data: String = row.get(0)?;
            Ok(data) // Just return the string for now
        })?;

        // Collect the results and handle deserialization separately
        let mut result = Vec::new();
        for row in rows {
            let data = row?;
            let classes: Vec<Class> = serde_json::from_str(&data)
                .map_err(|e| anyhow::anyhow!("Unable to deserialize combinations: {}", e))?;
            result.push(classes);
        }

        Ok(result)
    }).await?
}

pub async fn save_combinations_backend(combinations: &Vec<Vec<Class>>) -> Result<(), anyhow::Error> {
    // Clone combinations to move into the spawn_blocking closure
    let combinations_clone = combinations.clone();

    tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
        let mut conn = Connection::open("programData.db")?;

        // Begin a transaction for better performance with batch operations
        let tx = conn.transaction()?;

        // Clear existing combinations that are not favorited
        tx.execute("DELETE FROM combinations", [])?;

        {
            // Prepare the statement once outside the loop for efficiency
            let mut stmt = tx.prepare("INSERT INTO combinations (id, data) VALUES (?, ?)")?;

            // Insert each combination as a separate row
            for (index, combination) in combinations_clone.iter().enumerate() {
                // Serialize the combination to JSON
                let json_data = serde_json::to_string(combination)?;

                // Execute the prepared statement
                stmt.execute(params![index as i64, json_data])?;
            }
        } // The borrow of `tx` by `stmt` ends here

        // Commit the transaction
        tx.commit()?;

        Ok(())
    }).await?
}

pub async fn delete_combination_backend(idx: i32) -> Result<(), anyhow::Error> {
    // Spawn a blocking task since SQLite operations are synchronous
    tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
        // Open connection to SQLite database
        let conn = Connection::open("programData.db")?;

        let mut stmt = conn.prepare("DELETE FROM combinations WHERE id = (SELECT id FROM combinations ORDER BY id LIMIT 1 OFFSET ?1)")?;
        stmt.execute(params![idx])?;
       
        Ok(())
    }).await??; // First '?' handles JoinError, second '?' handles the inner anyhow::Error

    Ok(())
}

pub async fn save_event(table: String, event: Event) -> Result<(), anyhow::Error> {
    tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
        let conn = Connection::open("programData.db")?;

        let index = match TABLENAMES.iter().position(|s| *s == table) {
            Some(index) => index,
            None => return Err(anyhow!("Unable to find table")),
        };
        let insert_statement = format!("INSERT INTO {} (id, title, start_time, end_time, day, professor, description) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", TABLENAMES[index]);

        // Insert new event
        conn.execute(&insert_statement,
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

        Ok(())
    }).await?
}

pub async fn load_events(table: String) -> Result<Vec<Event>, anyhow::Error> {
    tokio::task::spawn_blocking(move || -> Result<Vec<Event>, anyhow::Error> {
        let conn = Connection::open("programData.db")?;

        let index = match TABLENAMES.iter().position(|s| *s == table) {
            Some(index) => index,
            None => return Err(anyhow!("Unable to find table")),
        };
        let statement = format!( "SELECT id, title, start_time, end_time, day, professor, description FROM {}", TABLENAMES[index]);
        let mut stmt = conn.prepare(
            &statement
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
        .collect::<Result<Vec<_>, _>>()?; // This already correctly handles rusqlite::Error

        Ok(events)
    }).await?
}

pub async fn delete_events(table: String, event_id: String) -> Result<(), anyhow::Error> {
    tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
        let conn = Connection::open("programData.db")?;

        let index = match TABLENAMES.iter().position(|s| *s == table) {
            Some(index) => index,
            None => return Err(anyhow!("Unable to find table")),
        };
        let statement = format!("DELETE FROM {} WHERE id = ?1", TABLENAMES[index]);
        conn.execute(&statement, params![event_id],)?;
        Ok(())
    }).await?
}

pub async fn change_favorite_status(id: i32, schedule: Option<Vec<Class>>) -> Result<(), anyhow::Error> {
    // Spawn a blocking task since SQLite operations are synchronous
    tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
        // Open connection to SQLite database
        let conn = Connection::open("programData.db")?;

        match schedule{
            Some(schedule_unwrapped) => {
                let json_data = serde_json::to_string(&schedule_unwrapped)?;
                let mut stmt = conn.prepare("INSERT INTO favorites (id, data) VALUES (?1, ?2)")?;
                stmt.execute(params![id, json_data])?;
            },
            None => {
                // Delete by row given by id + 1 (since id starts at 0)
                let mut stmt = conn.prepare("DELETE FROM favorites WHERE id = (SELECT id FROM favorites ORDER BY id LIMIT 1 OFFSET ?1)")?;
                stmt.execute(params![id])?;
            },
        };
       
        Ok(())
    }).await??; // First '?' handles JoinError, second '?' handles the inner anyhow::Error

    Ok(())
}
