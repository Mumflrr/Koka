use std::sync::Arc;

use thirtyfour::prelude::*;
use crate::{start_chromedriver, ConnectInfo};

pub async fn check_schedule_scrape(connect_info_mutex: &Arc<std::sync::Mutex<ConnectInfo>>) -> Result<(), String> {
    // Acquire lock
    let connect_info = match connect_info_mutex.lock() {
        Ok(guard) => guard,
        Err(e) => return Err(format!("Failed to acquire lock: {}", e)),
    };
    
    // Start chromedriver - pass a reference to the ConnectInfo inside the MutexGuard
    let driver = match start_chromedriver(&*connect_info).await {
        Ok(webdriver) => {
            // If successful, drop the lock and return the webdriver
            drop(connect_info);
            webdriver
        },
        Err(err) => {
            // Lock automatically released here when connect_info goes out of scope
            return Err(format!("Failed to start chromedriver: {}", err));
        }
    };

    // Do the actual scrape
    match perform_schedule_scrape(driver).await {
        Ok(()) => Ok(()),
        Err(err) => Err(format!("{}", err)),
    }
}

// Performs the scraping
async fn perform_schedule_scrape(driver: WebDriver) -> Result<(), anyhow::Error> {
    // Website to scrape scheduler
    //let websites = "https://portalsp.acs.ncsu.edu/"

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
