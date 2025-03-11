use std::time::Duration;
use thirtyfour::prelude::*;
use anyhow::anyhow;
use tokio::time::{sleep, Instant};

use crate::{Class, ClassParam};


// Performs the scraping
pub async fn perform_schedule_scrape(params: [bool; 3], classes: Vec<ClassParam>, driver: WebDriver) -> Result<Vec<Vec<Class>>, anyhow::Error> {    
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

    let check_boxes = driver.find_all(By::ClassName("search-filter-checkbox")).await?;
    //let check_wait = driver.find(By::Css("div.searchOpts")).await?.find(By::Tag("form")).await?;
    // When form has class of 'ui-state-disabled' then wait
    if !params[0] {
        //TODO: Update wait logic
        check_boxes[0].click().await?;
    }
    if params[1] {
        //TODO: Update wait logic
        sleep(Duration::from_secs(1)).await;
        check_boxes[1].click().await?;
    }
    if !params[2] {
        //TODO: Update wait logic
        sleep(Duration::from_secs(1)).await;
        check_boxes[2].click().await?;
    }

    let mut results: Vec<Vec<Class>> = Vec::new();
    for class in classes {
        // Click the dropdown to open it
        let subject_select = driver.find(By::Id("subject")).await?;
        subject_select.click().await?;

        // Find and click the option with the matching value
        let option_selector = format!("option[value='{}']", class.code);
        let subject_option = driver.find(By::Css(&option_selector)).await?;
        subject_option.click().await?;

        // Input catalog number (course number)
        let catalog_input = driver.find(By::Id("catalogNbr")).await?;
        catalog_input.clear().await?;
        catalog_input.send_keys(&class.name).await?;

        // Clear and input professor name if available
        let instructor_input = driver.find(By::Id("instructorName")).await?;
        instructor_input.clear().await?;
        if !class.instructor.is_empty() {
            instructor_input.send_keys(&class.instructor).await?;
        }

        // Click the search button
        let search_button = driver.find(By::Id("class-search-btn")).await?;
        search_button.click().await?;

        // Narrow scope down to table (once is shows up)
        let table = driver.query(By::Id("classSearchTable")).first().await?;
        table.wait_until().displayed().await?;
        let table = driver.find(By::Id("classSearchTable")).await?;

        // Find the course details link
        let course_link = table.query(By::Css("span.showCourseDetailsLink")).first().await?;
        course_link.wait_until().displayed().await?;
        table.find(By::Css("span.showCourseDetailsLink")).await?.click().await?;

        // Wait for dialog to appear 
        //TODO: Implement better wait system
        sleep(Duration::from_secs(2)).await;
        let dialog = driver.find(By::Id("dialog2")).await?;
        let dialog_text = dialog.text().await?;

        // Extract description from the dialog
        let description = match dialog.find(By::XPath("//span[contains(text(),'Description')]/following::text()")).await {
            Ok(desc_elem) => desc_elem.text().await.unwrap_or_default(),
            Err(_) => extract_text_after(&dialog_text, "Description", "</div>"),
        };

        // Extract additional details
        let units = extract_text_after(&dialog_text, "Units:", "\n");
        let prerequisites = extract_text_after(&dialog_text, "Prerequisite:", "\n");

        // Format the complete description
        let full_description = format!(
            "Units: {} | Prerequisites: {} | Description: {}",
            units,
            prerequisites,
            description
        );
    
        // Now scrape the search results
        let predetermined_info = vec!(class.code, class.name, full_description);
        let search_results = scrape_search_results(&table, predetermined_info).await?;

        // Add these results to our main results vector
        results.push(search_results);

        let close_buttons = driver.find_all(By::Css("button.ui-button")).await?;
        close_buttons[1].click().await?;
        driver.find(By::Css("button.ui-dialog-titlebar-close")).await?.click().await?;

        // Add a small delay between searches just in case
        sleep(Duration::from_secs(1)).await;
    }

    // Always explicitly close the browser.
    driver.quit().await?;
                            
    Ok(results)
}

// Scrape search results from the page
async fn scrape_search_results(driver: &WebElement, predetermined_info: Vec<String>) -> WebDriverResult<Vec<Class>> {
    let mut results = Vec::new();
    
    // Find all instances of the class
    let result_rows = driver.find_all(By::Css("td.child")).await?;
    for row in result_rows {
        // The data per class instance should be able to be found with these tags
        let raw_data = row.find_all(By::Tag("td")).await?; 

        // Make array that data will be stored into (section should be always present so pre-initialized)
        let mut data_array: [String; 5] = std::array::from_fn(|_| String::new());
        data_array[0] = raw_data[0].find_all(By::Css("span.classDetailValue")).await?[2].inner_html().await?; 

        let temp = raw_data[0].find(By::Css("span.locationValue")).await?.inner_html().await?;  
        for i in 2..raw_data.len() - 1 {
            let element = raw_data[i].inner_html().await;
            data_array[i - 1] = element.unwrap_or("".to_string());
        }
        data_array[3] = temp;
        
        // Convert days from Vec<String> to Vec<bool>
        let day_string = &data_array[1];
        let days_bool = vec![
            day_string.contains("Mon"),
            day_string.contains("Tue"),
            day_string.contains("Wed"),
            day_string.contains("Thu"),
            day_string.contains("Fri")
        ];

        let location_result: String;
        if days_bool.iter().all(|&value| value == false) {
            location_result = "Distance Education - Online".to_string();
        }
        else {
            location_result = extract_text_after(data_array[3].as_str(), "(", ")").trim().to_string();
        }

        // Time handling
        let time_text = data_array[2].clone();
        let time = if time_text.trim().is_empty() {
            // Default for empty time strings
            (-1, -1)
        } else {
            convert_time(time_text)
        };

        results.push(Class {
            code: predetermined_info[0].clone(),
            name: predetermined_info[1].clone(),
            section: data_array[0].clone(),
            time: time,
            days: days_bool,
            location: location_result,
            instructor: data_array[4].clone(),
            description: predetermined_info[2].clone(),
        });

        println!("{}", results[results.len() - 1]);
    }

    Ok(results)
}

// Optimized time conversion function
fn convert_time(time_str: String) -> (i32, i32) {
    // Handle empty input
    let time_str = time_str.trim();
    if time_str.is_empty() {
        return (-1, -1);
    }
    
    // Remove HTML tags
    let cleaned_time = time_str
        .replace("<span class=\"inner_tbl_br\">", "")
        .replace("</span>", "")
        .trim()
        .to_string();
    
    // Check if we have a time range
    if let Some((start_time, end_time)) = cleaned_time.split_once('-') {
        let start = parse_time_component(start_time.trim());
        let end = parse_time_component(end_time.trim());
        
        return (start, end);
    }
    
    // If no hyphen, process as a single time
    (parse_time_component(&cleaned_time), -1)
}

// Helper function to parse a single time component like "11:45 AM"
fn parse_time_component(time: &str) -> i32 {
    let parts: Vec<&str> = time.split_whitespace().collect();
    
    // Early return if we don't have exactly two parts (time and AM/PM)
    if parts.len() != 2 {
        return -1;
    }
    
    let time_part = parts[0];
    let period = parts[1].to_uppercase();
    
    let time_components: Vec<&str> = time_part.split(':').collect();
    if time_components.len() != 2 {
        return -1;
    }
    
    // Parse hours and minutes
    let hours: i32 = match time_components[0].parse() {
        Ok(h) => h,
        Err(_) => return -1,
    };
    
    let minutes: i32 = match time_components[1].parse() {
        Ok(m) => m,
        Err(_) => return -1,
    };
    
    // Convert to military time
    let adjusted_hours = if period == "PM" && hours != 12 {
        hours + 12
    } else if period == "AM" && hours == 12 {
        0
    } else {
        hours
    };
    
    // Return in HHMM format
    adjusted_hours * 100 + minutes
}

// Extract text between a prefix and suffix from text
fn extract_text_after(text: &str, prefix: &str, suffix: &str) -> String {
    text.to_lowercase()
        .find(&prefix.to_lowercase())
        .map(|start_idx| {
            let start = start_idx + prefix.len();
            let after_prefix = &text[start..];
            
            after_prefix
                .find(suffix)
                .map_or_else(
                    || after_prefix.trim().to_string(),
                    |end_idx| after_prefix[..end_idx].trim().to_string()
                )
        })
        .unwrap_or_default()
}