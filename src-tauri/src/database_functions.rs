use rusqlite::{params, Connection};

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