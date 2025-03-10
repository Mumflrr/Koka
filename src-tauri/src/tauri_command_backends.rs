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
    let check_wait = driver.find(By::Css("div.searchOpts")).await?.find(By::Tag("form")).await?;
    if !params[0] {
        let should_wait = check_wait.class_name().await;
        match should_wait {
            Ok(_) => println!("GO AHEAD"),
            Err(_) => println!("YES WAIT"),
        }

        check_boxes[0].click().await?;
    }
    if params[1] {
        check_boxes[1].click().await?;
    }
    if !params[2] {
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

        // Input professor name if available
        if !class.instructor.is_empty() {
            let instructor_input = driver.find(By::Id("instructorName")).await?;
            instructor_input.clear().await?;
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
        let dialog = driver.query(By::Id("dialog2")).first().await?;
        dialog.wait_until().displayed().await?;
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

        //TODO: FIXXXXX
        driver.find(By::Css("div.ui-dialog-buttonpane")).await?.click().await?;        

        // Add a small delay between searches to avoid overwhelming the server
        sleep(Duration::from_millis(500)).await;
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
        data_array[0] = raw_data[0].find(By::Css("span.classDetailValue")).await?.inner_html().await?; 

        for i in 2..raw_data.len() - 1 {
            let element = raw_data[i].inner_html().await;
            data_array[i - 1] = element.unwrap_or("".to_string());
        }
        
        // Convert days from Vec<String> to Vec<bool>
        let day_string = data_array[1];
        let mut days_bool = vec![false; 5]; // [Mon, Tue, Wed, Thu, Fri]
        days_bool[0] = if day_string.contains("Mon") {true} else {false};
        days_bool[1] = if day_string.contains("Tue") {true} else {false};
        days_bool[2] = if day_string.contains("Wed") {true} else {false};
        days_bool[3] = if day_string.contains("Thu") {true} else {false};
        days_bool[4] = if day_string.contains("Fri") {true} else {false};

        // Time handling
        let time_text = data_array[2];
        let time = if time_text.trim().is_empty() {
            // Default for empty time strings
            (-1, -1)
        } else {
            convert_time(time_text)
        };
        
        results.push(Class {
            code: predetermined_info[0].clone(),
            name: predetermined_info[1].clone(),
            section: data_array[0],
            time: time,
            days: days_bool,
            location: data_array[4],
            instructor: data_array[3],
            description: predetermined_info[2].clone(),
        });

        println!("{}", results[results.len() - 1]);
    }

    Ok(results)
}

// Extract class location
fn extract_location(html: &str) -> String {
    // Check for Distance Education - Online first
    if html.contains("Distance Education - Online") {
        return "Distance Education - Online".to_string();
    }
    
    // Look for the text inside show-detail span
    if let Some(start_idx) = html.find("<span class=\"show-detail\">") {
        let content_start = start_idx + "<span class=\"show-detail\">".len();
        
        if let Some(end_idx) = html[content_start..].find("</span>") {
            return html[content_start..(content_start + end_idx)].to_string();
        }
    }
    
    // Return original or empty if no match is found
    html.to_string()
}

// Fixed convert_time function to handle empty inputs
fn convert_time(time_str: String) -> (i32, i32) {
    // Handle empty input
    if time_str.trim().is_empty() {
        return (-1, -1);
    }
    
    // Simple HTML tag removal (not comprehensive but handles basic cases)
    let cleaned_time = time_str.replace("<span class=\"inner_tbl_br\">", "").replace("</span>", "");
    
    // Check if we have a time range (contains a hyphen)
    if cleaned_time.contains("-") {
        // Split the range and extract both start and end times
        let parts: Vec<&str> = cleaned_time.split("-").collect();
        if parts.len() >= 2 {
            let start_time = parts[0].trim().to_string();
            let end_time = parts[1].trim().to_string();
            
            let (start_hours, start_minutes) = convert_single_time(start_time);
            let (end_hours, end_minutes) = convert_single_time(end_time);
            
            // Handle invalid time components
            if start_hours == -1 || start_minutes == -1 || end_hours == -1 || end_minutes == -1 {
                return (-1, -1);
            }
            
            // Format as HHMM for both times
            let combined_start = start_hours * 100 + start_minutes;
            let combined_end = end_hours * 100 + end_minutes;
            
            return (combined_start, combined_end);
        }
    }
    
    // If no hyphen, process as a single time
    let (hours, minutes) = convert_single_time(cleaned_time);
    if hours == -1 || minutes == -1 {
        return (-1, -1);
    }
    
    (hours * 100 + minutes, -1) // Return HHMM format for single time, -1 for end time
}

// Helper to convert a single time like "11:45 AM"
fn convert_single_time(time: String) -> (i32, i32) {
    // Parse the time string
    let parts: Vec<&str> = time.split_whitespace().collect();
    
    // Early return if we don't have exactly two parts (time and AM/PM)
    if parts.len() != 2 {
        return (-1, -1); // Return default value for invalid input
    }
    
    let time_part = parts[0];
    let period = parts[1].to_uppercase();
    
    let time_components: Vec<&str> = time_part.split(':').collect();
    if time_components.len() != 2 {
        return (-1, -1); // Return default value for invalid input
    }
    
    // Parse hours and minutes
    let hours: i32 = match time_components[0].parse() {
        Ok(h) => h,
        Err(_) => return (-1, -1),
    };
    
    let minutes: i32 = match time_components[1].parse() {
        Ok(m) => m,
        Err(_) => return (-1, -1),
    };
    
    // Convert to military time
    let adjusted_hours = if period == "PM" && hours != 12 {
        hours + 12
    } else if period == "AM" && hours == 12 {
        0
    } else {
        hours
    };
    
    (adjusted_hours, minutes)
}

// Helper function to extract text between a prefix and a suffix
fn extract_text_after(text: &str, prefix: &str, suffix: &str) -> String {
    if let Some(start_idx) = text.find(prefix) {
        // Get the starting position after the prefix
        let start = start_idx + prefix.len();
        
        // Get the substring after the prefix
        let after_prefix = &text[start..];
        
        // Find the suffix in the substring after the prefix
        if let Some(end_idx) = after_prefix.find(suffix) {
            // Return the trimmed substring between prefix and suffix
            return after_prefix[..end_idx].trim().to_string();
        } else {
            // If suffix not found, return everything after the prefix
            return after_prefix.trim().to_string();
        }
    }
    "".to_string()
}