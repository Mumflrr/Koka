use thirtyfour::prelude::*;
use crate::{start_chromedriver, CONNECTINFO};



// Does error processing from performing the scraping
pub async fn scrape_schedule(url_struct: &CONNECTINFO) -> Option<String> {

    match perform_scrape_schedule(url_struct).await {
        Ok(()) => return None,
        Err(err) => return Some(format!("{}", err)),
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
