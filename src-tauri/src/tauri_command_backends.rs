use std::time::Duration;
use thirtyfour::prelude::*;
use anyhow::anyhow;
use tokio::time::{sleep, Instant};

use crate::Class;

// Performs the scraping
pub async fn perform_schedule_scrape(params: [bool; 3], classes: Box<[Class]>, driver: WebDriver) -> Result<(), anyhow::Error> {    
    // Navigate to myPack
    driver.goto("https://portalsp.acs.ncsu.edu/psc/CS92PRD_newwin/EMPLOYEE/NCSIS/c/NC_WIZARD.NC_ENRL_WIZARD_FL.GBL?Page=NC_ENRL_WIZARD_FLPAGE=NC_ENRL_WIZARD_FL").await?;
    
    // Determine if properly navigated to shib page; ONLY WORKS IF ASSUMED WINDOW WILL OPEN
    let button = match driver.find(By::ClassName("IdPSelectPreferredIdPButton")).await {
        Ok(button) => button,
        Err(_) => return Err(anyhow!("Unable to access myPack")),
    };

    // Find and click the button to input credentials
    button.find(By::Tag("a")).await?.click().await?;
    
    // Wait for user to input credentials and duo auth
    let timeout = Duration::from_secs(120);
    let start = Instant::now();
    
    while start.elapsed() < timeout {
        if driver.find(By::Id("pt_envinfo")).await.is_ok() {
            break;
        }
        sleep(Duration::from_millis(100)).await;
    }
    if start.elapsed() >= timeout {
        return Err(anyhow!("timeout!"))
    }
    
    driver.enter_frame(0).await?;
    let cart_label = driver.query(By::Id("add-to-cart-label")).first().await?;
    cart_label.wait_until().displayed().await?;
    cart_label.click().await?;
    driver.find(By::Id("classSearchTab")).await?.click().await?;

    if params[0] {

    }
    if params[1] {

    }
    if params[2] {

    }

    loop{}

    // Always explicitly close the browser.
    driver.quit().await?;
                            
    //Ok(())
}
