use std::process::Command;
use crate::{chrome_setup, get_version, ConnectInfo};
use rusqlite::{params, Connection, Result};

// For the given os, setup the ConnectInfo struct and set the struct os_url field to the
// corresponding chromedriver directory, and save values into database
#[cfg(target_os = "macos")]
fn os_setup(conn: &Connection) -> ConnectInfo {
    let mut connect_info = setup_struct();
    connect_info.os = if cfg!(target_arch = "aarch64") {
        String::from("mac-arm64")
    } else {
        String::from("mac-x64")
    };

    conn.execute("INSERT INTO data (id, os) VALUES (0, ?1)", params![connect_info.os])
            .expect("OSetup: Unable to save program info into db");

    check_and_install_dependencies();
    connect_info
}

#[cfg(target_os = "windows")]
fn os_setup(conn: &Connection) -> ConnectInfo {
    let mut connect_info = setup_struct();
    connect_info.os = String::from("win64");

    conn.execute("INSERT INTO data (id, os) VALUES (0, ?1)", params![connect_info.os])
            .expect("OSetup: Unable to save program info into db");

    check_and_install_dependencies();
    connect_info
}



#[cfg(target_os = "linux")]
fn os_setup(conn: &Connection) -> ConnectInfo {
    let mut connect_info = setup_struct();
    connect_info.os = String::from("linux64");

    conn.execute("INSERT INTO data (id, os) VALUES (0, ?1)", params![connect_info.os])
            .expect("OSetup: Unable to save program info into db");

    check_and_install_dependencies();
    connect_info
}

// Ensure the system has dependencies installed
fn check_and_install_dependencies() {
    if Command::new("node").arg("-v").status().is_err() {
        install_node();
    }

    let output = Command::new("pnpm")
        .current_dir("../src") // adjust this path as needed
        .arg("install")
        .arg("react-router-dom")
        .output()
        .expect("Failed to execute pnpm install"); 
    if !output.status.success() {
        panic!("pnpm install failed: {}", String::from_utf8_lossy(&output.stderr));
    }
}

// Install node if not installed
fn install_node() {
    // Installation commands will vary based on the operating system
    #[cfg(target_os = "macos")] {
        Command::new("brew").args(["install", "node"]).status().expect("Failed to install Node.js");
    }
    #[cfg(target_os = "linux")] {
        Command::new("sudo").args(&["apt", "install", "-y", "nodejs"]).status().expect("Failed to install Node.js");
    }
    #[cfg(target_os = "windows")] {
        // For Windows, you might need to use a package manager like Chocolatey or download the installer manually
        println!("Please install Node.js manually from https://nodejs.org/");
        let version = "22.7.0";
        let output = Command::new("fnm")
        .args(&["install", version])
        .output();

        if output.status.success() {
            println!("Node.js {} installed successfully", version);
        } else {
            let error = String::from_utf8_lossy(&output.stderr);
            println!("Failed to install Node.js {}: {}", version, error);
        }
    }
}

// Function called to setup and install dependencies for the program
pub fn setup_program() -> Result<ConnectInfo, anyhow::Error> {

    // May need to call quit chromedriver functions here

    // Setup database and return the setup struct or panic
    let mut connect_info = setup_database()?;
    println!("Database setup!");

    // Setup Chromium and ChromeDriver; Panic otherwise since these programs are necessary
    chrome_setup(&mut connect_info)?;
    println!("Program setup!");

    Ok(connect_info)
}

// Setup base struct
fn setup_struct() -> ConnectInfo {
    ConnectInfo {
        os : String::from(""),
        version : String::from(""),
    }
}

fn setup_database() -> Result<ConnectInfo, anyhow::Error> {
    // Open database file
    let conn = Connection::open("programData.db")?;

    // Create table if need be
    conn.execute(
        "CREATE TABLE IF NOT EXISTS data (id SMALLINT, version TINYTEXT, os TINYTEXT)",
        (),
    )?;

    // Pre-allocate struct and prepare statement
    let mut connect_info: ConnectInfo;
    let mut stmt = conn.prepare("SELECT version, os FROM data WHERE id = 0")?;

    // Run statement and try to save result into a struct
    // If successful then save the resulting struct into the pre-allocated struct
    // If an error is thrown because there is no table, then setup struct with os_setup and get_version
    match stmt.query_row([], |row| {
                                    Ok(ConnectInfo {
                                        version: row.get(0)?,
                                        os: row.get(1)?,
                                    })}) {
        Ok(result_struct) => connect_info = result_struct,
        Err(_) => {connect_info = os_setup(&conn);
                    get_version(&mut connect_info)?;
                    }
    }

    println!("Retrieved data: {}, {}", connect_info.os, connect_info.version);

    Ok(connect_info)
} 