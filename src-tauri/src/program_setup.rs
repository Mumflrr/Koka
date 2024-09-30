use std::process::Command;
use crate::{chrome_setup, chromedriver_setup, CONNECTINFO};

#[cfg(target_os = "macos")]
fn os_setup() -> CONNECTINFO {
    let mut url_struct = setup_struct();
    url_struct.os_url = if cfg!(target_arch = "aarch64") {
        String::from("/chromedriver_mac_arm64.zip")
    } else {
        String::from("/chromedriver_mac64.zip")
    };
    //check_and_install_dependencies();
    url_struct
}

#[cfg(target_os = "windows")]
fn os_setup() -> CONNECTINFO {
    let mut url_struct = setup_struct();
    url_struct.os_url = String::from("/chromedriver_win32.zip");
    //check_and_install_dependencies();
    url_struct
}

#[cfg(target_os = "linux")]
fn os_setup() -> CONNECTINFO {
    let mut url_struct = setup_struct();
    url_struct.os_url = String::from("/chromedriver_linux64.zip");
    //check_and_install_dependencies();
    url_struct
}

fn check_and_install_dependencies() {
    if !Command::new("node").arg("-v").status().is_ok() {
        install_node();
    }
    if !Command::new("pnpm").arg("-v").status().is_ok() {
        install_pnpm();
    }
}

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

fn install_pnpm() {
    Command::new("npm").args(&["install", "-g", "pnpm"]).status().expect("Failed to install pnpm");
}

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
            return Err(format!("Failed to terminate chromedriver: {}", error_message).into());
        }
    } else {
        println!("No chromedriver processes found.");
    }

    Ok(())
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
pub fn quit_chromedriver() -> Result<(), Box<dyn std::error::Error>> {
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
            return Err(format!("Failed to terminate chromedriver: {}", error_message).into());
        }
    } else {
        println!("No chromedriver processes found.");
    }

    Ok(())
}


fn setup_struct() -> CONNECTINFO {
    CONNECTINFO {
        chromedriver_url : String::from("https://chromedriver.storage.googleapis.com/"),
        os_url : String::from(""),
        version : String::from(""),
    }
}

pub fn setup_program() -> Result<CONNECTINFO, String> {
    let mut connectinfo_struct = os_setup();

    match chromedriver_setup(&mut connectinfo_struct) {
        Ok(previously_setup) => {
                                    if previously_setup {
                                        println!("{}", "Chromium already setup!");
                                    } else {
                                        println!("{}", "Chromium setup!");
                                        
                                        match chrome_setup(&connectinfo_struct) {
                                            Ok(()) => println!("Chrome for Testing installed successfully"),
                                            Err(err) => println!("{}", err),
                                        };
                                    }
                                },
        _ => panic!("Unable to setup Chromium!"),
    };


    Ok(connectinfo_struct)
}
