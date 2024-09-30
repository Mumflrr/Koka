use std::{fs::{self, File}, io::{copy, BufReader}, os::unix::fs::PermissionsExt, path::PathBuf, process::Command};

use reqwest::blocking::get;
use zip::ZipArchive;

use crate::{helper_functions::get_chrome_binary_path, os_setup, CONNECTINFO};


pub fn setup_struct() -> CONNECTINFO {
    CONNECTINFO {
        chromedriver_url : String::from("https://chromedriver.storage.googleapis.com/"),
        os_url : String::from(""),
        version : String::from(""),
    }
}

pub fn setup_program() -> Result<CONNECTINFO, String> {

    // Install node.js
    // Install pnpm
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

pub fn get_version(url_struct: &mut CONNECTINFO) -> Result<(), anyhow::Error> {
    let url = format!("{}LATEST_RELEASE", url_struct.chromedriver_url.as_str());
    let client = reqwest::blocking::Client::new();

    //context_error!(url_struct.version = client.get(url).send().text(), "get_version")?;
    url_struct.version = client.get(url).send()?.text()?;

    Ok(())
}

fn chrome_setup(url_struct: &CONNECTINFO) -> Result<(), Box<dyn std::error::Error>> {
    Command::new("pnpm")
    .args(&["add", "-g", "@puppeteer/browsers@2.4.0"])
    .output()?;

    println!("@puppeteer/browsers@2.4.0 installed successfully");

    let mut chrome_path = std::env::current_dir().expect("Failed to get current directory");
    chrome_path.push("resources");

    // Install Chrome to the specified path
    Command::new("pnpm")
        .args(&[
            "dlx",
            "@puppeteer/browsers",
            "install",
            format!("chrome@{}", url_struct.version).as_str(),
            "--path",
            chrome_path.into_os_string().into_string().unwrap().as_str(),
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
