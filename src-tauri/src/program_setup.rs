use std::{fs::{self, File}, io::{copy, BufReader}, os::unix::fs::PermissionsExt, path::PathBuf, process::Command};

use anyhow::Context;
use reqwest::blocking::get;
use zip::ZipArchive;

use crate::{context_error, helper_functions::get_chrome_binary_path, CONNECTINFO};

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


pub fn get_chromedriver_path() -> PathBuf {
    let mut path = std::env::current_dir().expect("Failed to get current directory");
    path.push("resources");
    path.push("chromedriver");
    if cfg!(target_os = "windows") {
        path.set_extension("exe");
    }
    path
}

fn get_version(url_struct: &mut CONNECTINFO) -> Result<(), anyhow::Error> {
    let url = format!("{}LATEST_RELEASE", url_struct.chromedriver_url.as_str());
    let client = reqwest::blocking::Client::new();

    url_struct.version =  context_error!(client.get(url).send()?.text(), "test")?;

    //url_struct.version =  client.get(url).send()?.text().context("Error: file-{}, function-{}, line-{} | {}", get_file(), get_function(), getLine(), "custom text") ?;

    Ok(())
}

fn chrome_setup(url_struct: &CONNECTINFO) -> Result<(), Box<dyn std::error::Error>> {
    // Install @puppeteer/browsers
    let pnpm_command = if cfg!(target_os = "windows") { "pnpm.cmd" } else { "pnpm" };
    
    Command::new(pnpm_command)
        .args(&["add", "-g", "@puppeteer/browsers@2.4.0"])
        .output()?;

    println!("@puppeteer/browsers@2.4.0 installed successfully");

    let mut chrome_path = std::env::current_dir().expect("Failed to get current directory");
    chrome_path.push("resources");

    // Install Chrome to the specified path
    Command::new(pnpm_command)
        .args(&[
            "dlx",
            "@puppeteer/browsers",
            "install",
            &format!("chrome@{}", url_struct.version),
            "--path",
            chrome_path.to_str().unwrap(),
        ])
        .output()?;


    let path_buf = get_chrome_binary_path(url_struct);

    // Get the current file metadata
    let metadata = fs::metadata(&path_buf)?;

    // Get the current permissions
    let mut permissions = metadata.permissions();

    // Set the permission to be executable by the owner (u+x)
    // This sets the permission bits to 0o755 (read, write, and execute for the owner, and read+execute for others)
    permissions.set_mode(0o755);

    // Apply the new permissions to the file or directory
    fs::set_permissions(&path_buf, permissions)?;

    
    Ok(())
}

fn chromedriver_setup(url_struct: &mut CONNECTINFO) -> Result<bool, anyhow::Error> {
    // Get chrome driver path (if exists)
    let chromedriver_path = get_chromedriver_path();

    // Check if ChromeDriver is installed
    if !chromedriver_path.exists() {
        println!("ChromeDriver not found. Installing...");
        let resources_path = chromedriver_path.parent().unwrap().to_path_buf();

        // Get latest chrome driver version
        get_version(url_struct)?;

        let download_url = format!("{}{}{}", url_struct.chromedriver_url.as_str(), url_struct.version, url_struct.os_url.as_str());

        let response = get(download_url)?;
        let mut file = File::create(resources_path.join("chromedriver.zip"))?;
        copy(&mut response.bytes()?.as_ref(), &mut file)?;

        // Extract ChromeDriver
        let zip_file = File::open(resources_path.join("chromedriver.zip"))?;
        let mut archive = ZipArchive::new(BufReader::new(zip_file))?;

        archive.extract(resources_path)?;

        Ok(false)

    } else {
        match get_version(url_struct) {
            Ok(()) => println!("ChromeDriver and Chromeium are already installed."),
            Err(_err) => panic!("Unable to setup ChromeDriver and Chromium"),
        };
        Ok(true)
    }

}
