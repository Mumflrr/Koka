use thirtyfour::prelude::*;
use crate::{start_chromedriver, ConnectInfo};

// Checks parameters relating to scraping the schedule
pub async fn check_schedule_scrape(connect_info: &ConnectInfo) -> Option<String> {

    // Do the actual scrape
    match perform_schedule_scrape(connect_info).await {
        Ok(()) => return None,
        Err(err) => return Some(format!("{}", err)),
    };
}

// Performs the scraping
async fn perform_schedule_scrape(connect_info: &ConnectInfo) -> Result<(), WebDriverError> {
    // Website to scrape scheduler
    // let websites = "https://portalsp.acs.ncsu.edu/"

    let driver = match start_chromedriver(connect_info).await {
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
