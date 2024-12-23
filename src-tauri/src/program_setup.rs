use std::process::Command;
use crate::{chrome_update_check, database_functions::setup_database, ConnectInfo};
use rusqlite::Result;

// Function called to setup and install dependencies for the program
pub async fn setup_program() -> Result<ConnectInfo, anyhow::Error> {
    // First get OS info without saving to database
    let os_info = os_setup_initial();
    println!("OS setup complete!");

    // Then setup database with the OS info
    let mut connect_info = setup_database(os_info).await?;
    println!("Database setup!");

    // Setup Chromium and ChromeDriver
    chrome_update_check(&mut connect_info).await?;
    println!("Program setup!");

    Ok(connect_info)
}

// New function to get OS info without database interaction
fn os_setup_initial() -> ConnectInfo {
    let mut connect_info = setup_struct();

    // Determine the OS and architecture
    connect_info.os = if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            String::from("mac-arm64")
        } else {
            String::from("mac-x64")
        }
    } else if cfg!(target_os = "windows") {
        String::from("win64")
    } else if cfg!(target_os = "linux") {
        String::from("linux64")
    } else {
        panic!("Unsupported operating system");
    };

    // Install dependencies
    check_and_install_dependencies();

    connect_info
}


// Setup base struct
fn setup_struct() -> ConnectInfo {
    ConnectInfo {
        os : String::from(""),
        version : String::from(""),
    }
}

// Ensure the system has dependencies installed
fn check_and_install_dependencies() {
    if Command::new("node").arg("-v").status().is_err() {
        install_node();
    }

    if Command::new("pnpm").arg("-v").status().is_err() {
        install_pnpm();
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

// Install pnpm if not installed
fn install_pnpm() {
    println!("Installing pnpm...");
    
    #[cfg(target_os = "macos")] {
        Command::new("brew")
            .args(["install", "pnpm"])
            .status()
            .expect("Failed to install pnpm on macOS");
    }

    #[cfg(target_os = "linux")] {
        Command::new("curl")
            .args(["-fsSL", "https://get.pnpm.io/install.sh"])
            .output()
            .expect("Failed to download pnpm install script on Linux")
            .status
            .success();

        Command::new("sh")
            .arg("install.sh")
            .status()
            .expect("Failed to install pnpm on Linux");
    }

    #[cfg(target_os = "windows")] {
        let output = Command::new("npm")
            .args(["install", "-g", "pnpm"])
            .output()
            .expect("Failed to install pnpm on Windows");

        if output.status.success() {
            println!("pnpm installed successfully on Windows.");
        } else {
            let error = String::from_utf8_lossy(&output.stderr);
            println!("Failed to install pnpm: {}", error);
        }
    }
}

// Install node if not installed
fn install_node() {
    #[cfg(target_os = "macos")] {
        Command::new("brew").args(["install", "node"]).status().expect("Failed to install Node.js");
    }
    #[cfg(target_os = "linux")] {
        Command::new("sudo").args(&["apt", "install", "-y", "nodejs"]).status().expect("Failed to install Node.js");
    }
    #[cfg(target_os = "windows")] {
        let version = "22.7.0";
        let installer_url = format!(
            "https://nodejs.org/dist/v{}/node-v{}-x64.msi",
            version, version
        );

        let installer_path = Path::new("node_installer.msi");

        // Download the installer
        println!("Downloading Node.js installer from {}", installer_url);
        let output = Command::new("curl")
            .args(&["-o", installer_path.to_str().unwrap(), &installer_url])
            .output();

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            println!("Failed to download Node.js installer: {}", error);
            return;
        }

        println!("Node.js installer downloaded successfully.");

        // Run the installer
        let output = Command::new("msiexec")
            .args(&["/i", installer_path.to_str().unwrap(), "/quiet", "/norestart"])
            .output();

        if output.status.success() {
            println!("Node.js {} installed successfully.", version);
        } else {
            let error = String::from_utf8_lossy(&output.stderr);
            println!("Failed to install Node.js {}: {}", version, error);
        }

        // Clean up the installer file
        if fs::remove_file(installer_path).is_ok() {
            println!("Cleaned up Node.js installer.");
        } else {
            println!("Failed to clean up Node.js installer.");
        }
    }
}