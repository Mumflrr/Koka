use std::time::Duration;
use thirtyfour::prelude::*;
use anyhow::anyhow;
use tokio::time::{sleep, Instant};

use crate::{Class, EventParam, ScrapeClassesParameters, TimeBlock};

// Performs the scraping
pub async fn perform_schedule_scrape(parameters: &ScrapeClassesParameters, driver: WebDriver) -> Result<Vec<Vec<Class>>, anyhow::Error> {    
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
    
    // Timeout
    while start.elapsed() < timeout {
        if driver.find(By::Id("pt_envinfo")).await.is_ok() {
            break;
        }
        sleep(Duration::from_millis(100)).await;
    }
    if start.elapsed() >= timeout {
        return Err(anyhow!("timeout!"))
    }
    
    // Enter iframe
    driver.enter_frame(0).await?;
    let cart_label = driver.query(By::Id("add-to-cart-label")).first().await?;
    cart_label.wait_until().displayed().await?;
    cart_label.click().await?;
    driver.find(By::Id("classSearchTab")).await?.click().await?;

    let check_boxes = driver.find_all(By::ClassName("search-filter-checkbox")).await?;
    if !parameters.params_checkbox[0] {
        let result = check_boxes[0].click().await;
        if result.is_err() {
            sleep(Duration::from_secs(1)).await;
            check_boxes[0].click().await?;
        }
    }
    if parameters.params_checkbox[1] {
        // Attempt retry if fails due to intercepted element -> tends to occur at <div class="search-filter-checkbox
        let result = check_boxes[1].click().await;
        if result.is_err() {
            sleep(Duration::from_secs(1)).await;
            check_boxes[1].click().await?;
        }
    }
    if !parameters.params_checkbox[2] {
        // Attempt retry if fails due to intercepted element -> tends to occur at <div class="search-filter-checkbox
        let result = check_boxes[2].click().await;
        if result.is_err() {
            sleep(Duration::from_secs(1)).await;
            check_boxes[2].click().await?;
        }
    }

    // For each class we want to scrape
    let mut results: Vec<Vec<Class>> = Vec::new();
    for class in &parameters.classes {
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
        sleep(Duration::from_secs(1)).await;
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
        let predetermined_info = vec!(class.code.clone(), class.name.clone(), class.section.clone(), full_description);
        let search_results = scrape_search_results(&table, &predetermined_info).await?;

        // Add these results to our main results vector
        results.push(search_results);

        let close_buttons = driver.find_all(By::Css("button.ui-button")).await?;
        close_buttons[1].click().await?;
        driver.find(By::Css("button.ui-dialog-titlebar-close")).await?.click().await?;
    }

    // Always explicitly close the browser.
    driver.quit().await?;
                            
    Ok(results)
}

pub fn filter_classes(input_classes: Vec<Vec<Class>>, parameters: &ScrapeClassesParameters) -> Result<Vec<Vec<Class>>, anyhow::Error> {

    if input_classes.is_empty() {
        println!("FilterClasses: Input classes vector is empty. Returning empty vector.");
        return Ok(Vec::new());
    }

    if parameters.classes.len() != input_classes.len() {
         eprintln!(
            "Warning: Parameter count ({}) doesn't match input class group count ({}). Filtering based on available parameters.",
            parameters.classes.len(),
            input_classes.len()
         );
    }

    // Initialize result vector with the same capacity as the input
    let mut filtered_result: Vec<Vec<Class>> = Vec::with_capacity(input_classes.len());

    println!("Filtering {} course groups...", input_classes.len());

    for (i, (course_sections, desired_class)) in input_classes.into_iter().zip(parameters.classes.iter()).enumerate() {

        println!("Filtering sections for course request {}: {} {} (Filter: Sec={}, Instr={})",
                 i + 1, desired_class.code, desired_class.name,
                 if desired_class.section.is_empty() { "Any" } else { &desired_class.section },
                 if desired_class.instructor.is_empty() { "Any" } else { &desired_class.instructor });

        // Filter the sections within the current course group
        let filtered_sections: Vec<Class> = course_sections
            .into_iter()
            .filter(|section| {
                // --- Section Filter Logic ---
                if section.classes.is_empty() {
                     println!("  -> Section (Code: {}) has no time blocks, filtering out.", section.code);
                     return false;
                }

                let representative_section_num = section.classes.first().map_or("N/A", |b| &b.section);
                let representative_instructor = section.classes.first().map_or("N/A", |b| &b.instructor);
                // Slightly reduced logging verbosity inside the filter closure
                // println!("  -> Evaluating Section: {} (Instructor: {})", representative_section_num, representative_instructor);

                // 2. Check Section Number Match
                let section_match = desired_class.section.is_empty() ||
                    section.classes.iter().any(|block| block.section == desired_class.section);
                if !section_match { return false; }

                // 3. Check Instructor Match
                let instructor_match = desired_class.instructor.is_empty() ||
                    section.classes.iter().any(|block| block.instructor.eq_ignore_ascii_case(&desired_class.instructor));
                if !instructor_match { return false; }

                // 4. Check Time Validity (Stricter): All blocks must be valid
                let all_time_blocks_valid = section.classes.iter().all(|time_block| {
                    validate_time_ok(&parameters.events, &time_block.days)
                });
                if !all_time_blocks_valid { return false; }

                // If all checks passed...
                true
            })
            .collect();

        // --- CHANGE HERE ---
        // Always push the resulting vector (filtered_sections) to the final result.
        // It will be empty if all sections were filtered out.
        if filtered_sections.is_empty() {
             println!(" -> Course group {} finished filtering. No sections remaining (keeping empty group).", i + 1);
        } else {
             println!(" -> Course group {} finished filtering. Kept {} sections.", i + 1, filtered_sections.len());
        }
        filtered_result.push(filtered_sections);
        // --- END CHANGE ---
    }

    println!("Filtering complete. Result contains {} groups (some might be empty).", filtered_result.len());
    Ok(filtered_result)
}


async fn scrape_search_results(driver: &WebElement, predetermined_info: &Vec<String>) -> WebDriverResult<Vec<Class>> {
    let mut results = Vec::new();
    
    // Find all instances of the class
    let sections = driver.find_all(By::Css("td.child")).await?;
    for individual_section in sections.iter() {
    
        let mut class_sections: Vec<TimeBlock> = Vec::new();
        let mut section_time_blocks = individual_section.find_all(By::Tag("tr")).await?;
    
        // The first //tr WebElement for each section is not needed, therefore calculate how many
        // "classes" per section there is (for example if a lab is attached to the section then 
        // there would be two "classes" in that section and therefore should skip over 2 elments
        // before deleting another instead of every other if there was no lab attached)
        // Then remove the //tr every nth spot, skipping over the //tr elements that actually
        // contain information we want
        section_time_blocks.remove(0);
    
        for time_block in section_time_blocks {   
            // The data per class instance should be able to be found with these tags
            let raw_data = time_block.find_all(By::Tag("td")).await?; 
    
            // Make array that data will be stored into (section should be always present so pre-initialized)
            let mut data_array: [String; 5] = std::array::from_fn(|_| String::new());
            data_array[0] = raw_data[0].find_all(By::Css("span.classDetailValue")).await?[2].inner_html().await?; 
    
            let temp = raw_data[0].find(By::Css("span.locationValue")).await?.inner_html().await?;  
            for i in 2..raw_data.len() - 1 {
                let element = raw_data[i].inner_html().await;
                data_array[i - 1] = element.unwrap_or("".to_string());
            }
    
            // Convert days from Vec<String> to Vec<bool>
            let day_string = &data_array[1];
            let mut days_bool = [false; 5];
            days_bool[0] = day_string.contains("Mon");
            days_bool[1] = day_string.contains("Tue");
            days_bool[2] = day_string.contains("Wed");
            days_bool[3] = day_string.contains("Thu");
            days_bool[4] = day_string.contains("Fri");
    
            // Time handling
            let days = convert_time(data_array[2].as_str(), days_bool);
    
            // Get location
            data_array[3] = temp;
            let location_result: String;
            if days_bool.iter().all(|&value| value == false) {
                location_result = "Distance Education - Online".to_string();
            }
            else {
                location_result = extract_text_after(data_array[3].as_str(), "(", ")").trim().to_string();
            }
    
            // Push time block to this section
            class_sections.push(TimeBlock {
                section: data_array[0].clone(),
                location: location_result,
                instructor: data_array[4].clone(),
                days: days,
            });
    
        }
    
        // Else push the section to the class Vec
        results.push(Class {
            code: predetermined_info[0].clone(),
            name: predetermined_info[1].clone(),
            classes: class_sections,
            description: predetermined_info[3].clone(),
        });
    
        //println!("!!{}", results[results.len() - 1]);
    }
    
    Ok(results)
}

// Check if times overlap with any events
fn validate_time_ok(events: &Vec<EventParam>, days: &[((i32, i32), bool); 5]) -> bool {
    
    // For each day in the week
    for (day_index, day) in days.iter().enumerate() {
        // Check if bool flag is false, signifying no class that day
        if day.1 == false {
            continue;
        }
    
        // Check each event for potential conflicts
        for event in events {
            // Check if there's a day overlap for this specific day
            if !event.days[day_index] {
                continue; // No day overlap for this specific day
            }
    
            // Check time overlap
            let time_overlap = day.0.0 <= event.time.1 && day.0.1 >= event.time.0;
            if time_overlap {return false};
        }
    }

    // No conflicts found
    true
}

// Optimized time conversion function
fn convert_time(time_str: &str, days: [bool; 5]) ->  [((i32, i32), bool); 5] {
    let mut time = [((-1, -1), false); 5];

    for i in 0..4 {    
        // Handle empty input
        let time_str = time_str.trim();
        if time_str.is_empty() || !days[i]{
            time[i] = ((-1, -1), false);
            continue;
        }
        
        // Remove HTML tags more efficiently; the double 'let' is for lifetime reasons
        // When multiple functions are strung together back to back in a line, each method returns 
        // an intermediary value
        // The .replace() function returns a String pointing from the time_str variable
        // The .trim() function returns a &str of the String from the .replace()
        // When the function 'line' is completed, all the intermediaries (like the Strings from .replace())
        // are dropped, and so the &str from .trim() is pointing to dropped memory
        // However when spaced like this, the .replace() strings are owned by the binding variable
        // and so will not be dropped until binding is freed from memory instead of when the line of 
        // functions/operations is complete
        let binding = time_str
            .replace("<span class=\"inner_tbl_br\">", "")
            .replace("</span>", "");
        let cleaned_time = binding
            .trim();
        
        // Check if we have a time range
        let hyphen_pos = cleaned_time.find('-').unwrap();
        let start_time = &cleaned_time[..hyphen_pos].trim();
        let end_time = &cleaned_time[hyphen_pos+1..].trim();
            
        let start = parse_time_component(start_time);
        let end = parse_time_component(end_time);
            
        time[i] = ((start, end), true);

    }

    time
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
    // Case-insensitive search using lowercase for comparison only
    let text_lower = text.to_lowercase();
    let prefix_lower = prefix.to_lowercase();
    
    if let Some(start_idx) = text_lower.find(&prefix_lower) {
        let start = start_idx + prefix.len();
        let text_after = &text[start..];
        let after_lower = &text_lower[start..];
        
        // Find suffix in lowercase text but extract from original
        if let Some(end_idx) = after_lower.find(&suffix.to_lowercase()) {
            text_after[..end_idx].trim().to_string()
        } else {
            text_after.trim().to_string()
        }
    } else {
        String::new()
    }
}