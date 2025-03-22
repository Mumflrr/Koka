use std::collections::BTreeMap;

use crate::Class;

pub async fn generate_combinations(classes: Vec<Vec<Class>>) -> Result<Vec<Vec<Class>>, anyhow::Error> {
    // Create indices for each class to avoid cloning during backtracking
    let mut class_indices: Vec<Vec<usize>> = Vec::with_capacity(classes.len());
    let mut flattened_classes: Vec<&Class> = Vec::new();
    
    // Build index structure
    for group in &classes {
        let mut group_indices = Vec::with_capacity(group.len());
        for class in group {
            group_indices.push(flattened_classes.len());
            flattened_classes.push(class);
        }
        class_indices.push(group_indices);
    }
    
    // Generate all schedules using backtracking with indices
    let mut results: Vec<Vec<usize>> = Vec::new();
    let mut current_schedule: Vec<usize> = Vec::new();
    
    // Start the backtracking process
    backtrack(
        &flattened_classes,
        &class_indices,
        &mut current_schedule,
        0,
        &mut results
    );

    results = sort_classes(results);
    
    // Convert indices back to actual Class objects (clone only at the end)
    let final_results = results
        .into_iter()
        .map(|schedule| {
            schedule.into_iter()
                .map(|idx| flattened_classes[idx].clone())
                .collect()
        })
        .collect();

    Ok(final_results)
}

// Backtracking function to explore all possible combinations
fn backtrack(
    flattened_classes: &[&Class],
    class_indices: &[Vec<usize>],
    current_schedule: &mut Vec<usize>,
    current_group: usize,
    results: &mut Vec<Vec<usize>>,
) {
    // Base case: we've considered all course groups
    if current_group == class_indices.len() {
        // Only add this schedule if it's not empty
        if !current_schedule.is_empty() {
            results.push(current_schedule.clone());
        }
        return;
    }
    
    // Try each class in the current group
    let mut added_class = false;
    for &class_idx in &class_indices[current_group] {
        if is_compatible(flattened_classes, class_idx, current_schedule) {
            added_class = true;
            current_schedule.push(class_idx);
            backtrack(
                flattened_classes,
                class_indices,
                current_schedule,
                current_group + 1,
                results
            );
            current_schedule.pop();
        }
    }
    
    // If we couldn't add any class from this group due to conflicts,
    // skip this group and continue
    if !added_class {
        backtrack(
            flattened_classes,
            class_indices,
            current_schedule,
            current_group + 1,
            results
        );
    }
}

// Check if a class is compatible with the current schedule
fn is_compatible(all_classes: &[&Class], new_class_idx: usize, schedule_indices: &[usize]) -> bool {
    let new_class = all_classes[new_class_idx];
    
    for &existing_idx in schedule_indices {
        let existing_class = all_classes[existing_idx];
        
        // Check for time conflicts between all sections of both classes
        for new_section in &new_class.classes {
            for existing_section in &existing_class.classes {
                // Check for time conflicts on any day they share
                for day_idx in 0..5 {
                    let new_day = new_section.days[day_idx];
                    let existing_day = existing_section.days[day_idx];
                    
                    // Skip if either class doesn't have a session on this day
                    if !new_day.1 || !existing_day.1 {
                        continue;
                    }
                    
                    // Extract time ranges
                    let (new_start, new_end) = (new_day.0.0, new_day.0.1);
                    let (existing_start, existing_end) = (existing_day.0.0, existing_day.0.1);
                    
                    // Check for time overlap
                    if new_start <= existing_end && new_end >= existing_start {
                        return false;
                    }
                }
            }
        }
    }
    
    true
}

fn sort_classes(all_classes: Vec<Vec<usize>>) -> Vec<Vec<usize>> {
    // Use a BTreeMap where the key is the length and the value is a Vec of schedules
    let mut buckets: BTreeMap<usize, Vec<Vec<usize>>> = BTreeMap::new();

    // Group schedules by length
    for schedule in all_classes {
        let len = schedule.len();
        buckets.entry(len).or_insert_with(Vec::new).push(schedule);
    }

    // Flatten the map back into a vector, with longer schedules first
    // (BTreeMap keys are sorted in ascending order)
    buckets.into_iter()
           .rev() // Reverse to get descending order (longer schedules first)
           .flat_map(|(_, schedules)| schedules)
           .collect()
}