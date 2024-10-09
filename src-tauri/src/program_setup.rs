use std::process::Command;
use crate::{chrome_setup, get_version, ConnectInfo};
use rusqlite::{params, Connection, Result};

// For the given os, setup the ConnectInfo struct and set the struct os_url field to the
// corresponding chromedriver directroy
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

    //check_and_install_dependencies();
    connect_info
}

#[cfg(target_os = "windows")]
fn os_setup() -> ConnectInfo {
    let mut connect_info = setup_struct();
    connect_info.os = String::from("win64");
    //check_and_install_dependencies();
    connect_info
}



#[cfg(target_os = "linux")]
fn os_setup() -> ConnectInfo {
    let mut connect_info = setup_struct();
    connect_info.os = String::from("linux64");
    //check_and_install_dependencies();
    connect_info
}

// Ensure the system has node and pnpm installed
fn check_and_install_dependencies() {
    if !Command::new("node").arg("-v").status().is_ok() {
        install_node();
    }
}

// Install node if not installed
fn install_node() {
    // Installation commands will vary based on the operating system
    #[cfg(target_os = "macos")] {
        Command::new("brew").args(&["install", "node"]).status().expect("Failed to install Node.js");
    }
    #[cfg(target_os = "linux")] {
        Command::new("sudo").args(&["apt", "install", "-y", "nodejs"]).status().expect("Failed to install Node.js");
    }
    #[cfg(target_os = "windows")] {
        // For Windows, you might need to use a package manager like Chocolatey or download the installer manually
        println!("Please install Node.js manually from https://nodejs.org/");
    }
}


// Make sure chromedriver is not running (for windows machine)
#[cfg(target_os = "windows")]
pub fn quit_chromedriver() -> Result<(), Box<dyn std::error::Error>> {
    let output = Command::new("tasklist")
        .args(&["/FI", "IMAGENAME eq chromedriver.exe", "/FO", "CSV", "/NH"])
        .output()?;

    let output_str = String::from_utf8(output.stdout)?;
    
    if output_str.contains("chromedriver.exe") {
        println!("Chromedriver processes found. Terminating...");
        let kill_output = Command::new("taskkill")
            .args(&["/F", "/IM", "chromedriver.exe"])
            .output()?;

        if kill_output.status.success() {
            println!("All chromedriver processes have been terminated.");
        } else {
            let error_message = String::from_utf8(kill_output.stderr)?;
            return Err(anyhow::anyhow!("Failed to terminate ChromDriver: {}", error_message));
        }
    } else {
        println!("No chromedriver processes found.");
    }

    Ok(())
}

// Make sure chromedriver is not running (for macos and linux machines)
#[cfg(any(target_os = "macos", target_os = "linux"))]
pub fn quit_chromedriver() -> Result<(), anyhow::Error> {
    let output = Command::new("pgrep")
        .arg("chromedriver")
        .output()?;

    if !output.stdout.is_empty() {
        println!("Chromedriver processes found. Terminating...");
        let kill_output = Command::new("pkill")
            .arg("chromedriver")
            .output()?;

        if kill_output.status.success() {
            println!("All chromedriver processes have been terminated.");
        } else {
            let error_message = String::from_utf8(kill_output.stderr)?;
            return Err(anyhow::anyhow!("Failed to terminate ChromDriver: {}", error_message));
        }
    } else {
        println!("No chromedriver processes found to kill.");
    }

    Ok(())
}

// Function called to setup and install dependencies for the program
pub fn setup_program() -> Option<ConnectInfo> {

    // Try to quit ChromeDriver; Panic otherwise since chromDriver should be started by the program
    match quit_chromedriver() {
        Ok(()) => (),
        Err(err) => {
            println!("{}", err);
            panic!();
        },
    };

    let mut connect_info: ConnectInfo;
    match setup_database() {
        Ok(ci_s) => connect_info = ci_s,
        Err(err) => panic!("Error: '{err}'"),
    };

    //let mut connect_info = os_setup();

    // Setup Chromium and ChromeDriver; Panic otherwise since these programs are necessary
    match chrome_setup(&mut connect_info) {
        Ok(()) => println!("Program setup!"),
        Err(err) => {
            println!("{}", err);
            panic!();
        },
    };

    return Some(connect_info)
}

// Setup base struct
fn setup_struct() -> ConnectInfo {
    ConnectInfo {
        os : String::from(""),
        version : String::from(""),
    }
}

fn setup_database() -> Result<ConnectInfo, anyhow::Error> {
    // Check if database already exists
    let conn = Connection::open("programData.db")?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS data (id SMALLINT, version TINYTEXT, os TINYTEXT)",
        (),
    )?;

    let mut connect_info: ConnectInfo;
    let mut stmt = conn.prepare("SELECT version, os FROM data WHERE id = 0")?;

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