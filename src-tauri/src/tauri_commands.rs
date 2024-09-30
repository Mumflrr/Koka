use std::{net::TcpStream, process::Command};
use thirtyfour::prelude::*;
use crate::{get_chromedriver_path, helper_functions::get_chrome_binary_path, CONNECTINFO};



// Does error processing from performing the scraping
pub async fn scrape_schedule(url_struct: &CONNECTINFO) -> Option<String> {

    match perform_scrape_schedule(url_struct).await {
        Ok(()) => return None,
        Err(err) => return Some(format!("{}", err)),
    };
}

async fn start_chromedriver(url_struct: &CONNECTINFO) -> Result<WebDriver, Box<dyn std::error::Error>> {
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

/// Performs the backend scraping
async fn perform_scrape_schedule(url_struct: &CONNECTINFO) -> Result<(), WebDriverError> {
    /* let website_CONNECTINFO : [&str; 5] = ["https://dining.ncsu.edu/location/clark/", "https://dining.ncsu.edu/location/fountain/",
                                "https://dining.ncsu.edu/location/case/", "https://dining.ncsu.edu/location/university-towers/",
                                "https://dining.ncsu.edu/location/one-earth/"];
     */

    
    let driver = match start_chromedriver(url_struct).await {
        Ok(webdriver) => webdriver,
        Err(err) => {
            println!("{}", err);
            panic!("Error!");
        }
    };

    // Navigate to https://wikipedia.org.
    driver.goto("https://wikipedia.org").await?;
    let elem_form = driver.find(By::Id("search-form")).await?;
                           
    // Find element from element.
    let elem_text = elem_form.find(By::Id("searchInput")).await?;
                           
    // Type in the search terms.
    elem_text.send_keys("selenium").await?;
                           
    // Click the search button.
    let elem_button = elem_form.find(By::Css("button[type='submit']")).await?;
    elem_button.click().await?;
                           
    // Look for header to implicitly wait for the page to load.
    driver.find(By::ClassName("firstHeading")).await?;
    assert_eq!(driver.title().await?, "Selenium - Wikipedia");
                               
    // Always explicitly close the browser.
    driver.quit().await?;
                           
    Ok(())
}
