use crate::Class;

pub async fn generate_combinations(classes: Vec<Vec<Class>>) -> Result<Vec<Vec<Class>>, anyhow::Error> {

    // --- ADDED CHECK ---
    // Check if any input group is empty *before* starting. If so, no combinations are possible.
    if classes.iter().any(|group| group.is_empty()) {
        println!("Combination Generation: Input contains an empty class group (due to filtering). No valid schedules possible.");
        return Ok(Vec::new()); // Return empty results immediately
    }
    // --- END ADDED CHECK ---


    // Create indices for each class to avoid cloning during backtracking
    let mut class_indices: Vec<Vec<usize>> = Vec::with_capacity(classes.len());
    let mut flattened_classes: Vec<&Class> = Vec::new();

    // Build index structure (This part is safe now due to the check above)
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
    let total_groups = classes.len();

    // Start the backtracking process
    backtrack(
        &flattened_classes,
        &class_indices,
        &mut current_schedule,
        0, // Start with the first group (index 0)
        &mut results,
        total_groups
    );

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

// Backtracking function to explore all possible combinations (No changes needed)
fn backtrack(
    flattened_classes: &[&Class],
    class_indices: &[Vec<usize>],
    current_schedule: &mut Vec<usize>,
    current_group: usize,
    results: &mut Vec<Vec<usize>>,
    total_groups: usize,
) {
    // Base case: we've considered all course groups
    if current_group == total_groups {
        if current_schedule.len() == total_groups {
             results.push(current_schedule.clone());
        }
        return;
    }

    // Try each class in the current group (class_indices[current_group] is guaranteed not empty by the initial check)
    for &class_idx in &class_indices[current_group] {
        if is_compatible(flattened_classes, class_idx, current_schedule) {
            current_schedule.push(class_idx);
            backtrack(
                flattened_classes,
                class_indices,
                current_schedule,
                current_group + 1,
                results,
                total_groups
            );
            current_schedule.pop();
        }
    }
}


// Check if a class is compatible with the current schedule (No changes needed)
fn is_compatible(all_classes: &[&Class], new_class_idx: usize, schedule_indices: &[usize]) -> bool {
    // ... existing code ...
    let new_class = all_classes[new_class_idx];
    for &existing_idx in schedule_indices {
        let existing_class = all_classes[existing_idx];
        for new_section in &new_class.classes {
            for existing_section in &existing_class.classes {
                for day_idx in 0..5 {
                    let new_day = new_section.days[day_idx];
                    let existing_day = existing_section.days[day_idx];
                    if !new_day.1 || !existing_day.1 { continue; } // Skip if not meeting on this day
                    if new_day.0.0 == -1 || existing_day.0.0 == -1 { continue; } // Skip if time is TBD/invalid

                    let (new_start, new_end) = new_day.0;
                    let (existing_start, existing_end) = existing_day.0;

                    // Standard overlap check: (StartA < EndB) and (StartB < EndA)
                    if new_start < existing_end && existing_start < new_end {
                        return false; // Conflict found
                    }
                }
            }
        }
    }
    true // No conflicts found
}