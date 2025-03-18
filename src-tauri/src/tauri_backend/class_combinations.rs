use std::collections::HashMap;

use crate::Class;

pub async fn generate_combinations(classes: Vec<Vec<Class>>) -> Result<Vec<Vec<Class>>, anyhow::Error> {
    // Flatten the classes for processing
    let mut flattened_classes = Vec::new();
    let mut original_indices = Vec::new();
    
    // Keep track of which original group and index each class came from
    for (group_idx, group) in classes.iter().enumerate() {
        for (class_idx, class) in group.iter().enumerate() {
            flattened_classes.push(class.clone());
            original_indices.push((group_idx, class_idx));
        }
    }
    
    // Group classes by code+name to ensure we pick at most one of each course
    let mut course_groups: HashMap<String, Vec<usize>> = HashMap::new();
    
    // Store indices instead of references to avoid lifetime issues
    for (idx, class) in flattened_classes.iter().enumerate() {
        let key = format!("{}{}", class.code, class.name);
        course_groups.entry(key).or_insert_with(Vec::new).push(idx);
    }
    
    // Convert to Vec to make it easier to work with in our backtracking algorithm
    let course_groups: Vec<Vec<usize>> = course_groups.into_values().collect();
    
    // Generate all schedules using backtracking
    let mut results: Vec<Vec<usize>> = Vec::new();
    let mut current_schedule: Vec<usize> = Vec::new();
    
    // Start the backtracking process
    backtrack(&flattened_classes, &course_groups, &mut current_schedule, 0, &mut results);
    
    // Convert indices back to actual Class objects
    let final_results = results
        .into_iter()
        .map(|schedule| {
            schedule.into_iter().map(|idx| flattened_classes[idx].clone()).collect()
        })
        .collect();
    
    Ok(final_results)
}

// Backtracking function to explore all possible combinations
fn backtrack(
    all_classes: &[Class],
    course_groups: &[Vec<usize>],
    current_schedule: &mut Vec<usize>,
    group_index: usize,
    results: &mut Vec<Vec<usize>>,
) {
    // Base case: we've considered all course groups
    if group_index == course_groups.len() {
        results.push(current_schedule.clone());
        return;
    }
    
    // Consider taking no class from this group
    backtrack(all_classes, course_groups, current_schedule, group_index + 1, results);
    
    // Try each class in the current group
    for &class_idx in &course_groups[group_index] {
        if is_compatible(all_classes, class_idx, current_schedule) {
            current_schedule.push(class_idx);
            backtrack(all_classes, course_groups, current_schedule, group_index + 1, results);
            current_schedule.pop();
        }
    }
}

// Check if a class is compatible with the current schedule
fn is_compatible(all_classes: &[Class], new_class_idx: usize, schedule_indices: &[usize]) -> bool {
    let new_class = &all_classes[new_class_idx];
    
    for &existing_idx in schedule_indices {
        let existing_class = &all_classes[existing_idx];
        
        // Check for time conflicts on any day they share
        for day in 0..5 {
            if new_class.days[day] && existing_class.days[day] {
                // Check time overlap
                let (new_start, new_end) = new_class.time;
                let (existing_start, existing_end) = existing_class.time;
                
                // Classes conflict if one starts during another
                // (start1 < end2) && (start2 < end1)
                if (new_start < existing_end) && (existing_start < new_end) {
                    return false;
                }
            }
        }
    }
    
    true
}