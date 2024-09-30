use std::{env, fs::{self, File}, io::{copy, BufReader}, net::TcpStream, path::PathBuf, process::Command};

#[cfg(not(target_os = "windows"))] 
    use std::os::unix::fs::PermissionsExt;

use reqwest::blocking::get;
use thirtyfour::{ChromiumLikeCapabilities, DesiredCapabilities, WebDriver};
use zip::ZipArchive;

use crate::{context_error, CONNECTINFO};

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

    Ok(())
}

pub fn chrome_setup(url_struct: &CONNECTINFO) -> Result<(), Box<dyn std::error::Error>> {
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

    #[cfg(unix)] {
        // Set the permission to be executable by the owner (u+x)
        // This sets the permission bits to 0o755 (read, write, and execute for the owner, and read+execute for others)
        permissions.set_mode(0o755);

        // Apply the new permissions to the file or directory
        fs::set_permissions(&path_buf, permissions)?;
    }

    Ok(())
}

pub fn chromedriver_setup(url_struct: &mut CONNECTINFO) -> Result<bool, anyhow::Error> {
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


pub async fn start_chromedriver(url_struct: &CONNECTINFO) -> Result<WebDriver, Box<dyn std::error::Error>> {
    // Set up WebDriver
    let mut caps = DesiredCapabilities::chrome();
    let path_buf = get_chrome_binary_path(url_struct);
    let path = format!("{}", path_buf.display());

    caps.set_binary(&path)?;

    // Start ChromeDriver
    let _chromedriver = Command::new(get_chromedriver_path())
    .arg("--port=9515")
    .arg("--verbose")
    .arg("--log-path=chromedriver.log")
    .spawn()
    .map_err(|e| Box::new(e) as Box<dyn std::error::Error>);

    // Wait for ChromeDriver to start and be accessible
    let max_retries = 5;
    for _ in 0..max_retries {
        if TcpStream::connect("localhost:9515").is_ok() {
            println!("ChromeDriver is running on port 9515");
            break;
        } else {
            println!("Waiting for ChromeDriver to start...");
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        }
    }

    let driver = WebDriver::new("http://localhost:9515", caps).await
        .map_err(|e| {
            eprintln!("WebDriver error: {:?}", e);
            e
    });

    match driver {
        Ok(_) => return Ok(driver.unwrap()),
        Err(err) => panic!("Error: {}", err),
    };
}

pub fn get_chrome_binary_path(url_struct: &CONNECTINFO) -> PathBuf {
    // Set the path to your custom Chrome binary
    let mut path_buf = std::env::current_dir().expect("Failed to get current directory");
    path_buf.push("resources");
    path_buf.push("chrome");

    // Find chromium binary folder
    let paths = fs::read_dir(&path_buf).unwrap();
    let mut name = String::from("");
    for path in paths {
        name = format!("{}", path.unwrap().path().display());
        if name.contains(&url_struct.version) {
            break;
        }
    }
    path_buf.push(&name);

    // There should be only one folder in this folder, so get it
    let paths = fs::read_dir(&path_buf).unwrap();
    for path in paths {
        name = format!("{}", path.unwrap().path().display());
    }
    path_buf.push(&name);

    // Cross-platform compatibility
    match env::consts::OS {
        "macos" => {
            path_buf.push("Google Chrome for Testing.app");
            path_buf.push("Contents");
            path_buf.push("MacOS");
            path_buf.push("Google Chrome for Testing");
        },
        "windows" => {
            path_buf.push("chrome.exe");
        },
        "linux" => {
            path_buf.push("chrome");
        },
        _ => panic!("Unsupported operating system"),
    }

    path_buf
}