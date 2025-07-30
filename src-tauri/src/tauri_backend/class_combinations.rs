//! Schedule combination generation module using backtracking algorithm
//! 
//! This module generates all valid schedule combinations from filtered course data
//! using an optimized backtracking approach with index-based references to minimize
//! memory allocation during the recursive exploration process.

use crate::Class;

/**
 * Generates all valid schedule combinations from course groups using backtracking
 * 
 * This function implements an optimized combination generation algorithm:
 * 1. Creates index-based references to avoid cloning during backtracking
 * 2. Flattens nested course structure for efficient access
 * 3. Uses recursive backtracking to explore all possible combinations
 * 4. Validates time conflicts between courses in different groups
 * 5. Only clones Class objects at the end for final results
 * 
 * @param {Vec<Vec<Class>>} classes - Course groups where each inner Vec contains sections for one course
 * @returns {Result<Vec<Vec<Class>>, anyhow::Error>} All valid schedule combinations or error
 * @throws {anyhow::Error} If backtracking algorithm encounters unexpected state
 */
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
    let total_groups = classes.len(); // This should be 2 in your 6x7 example

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

/**
 * Recursive backtracking function to explore all possible schedule combinations
 * 
 * This function implements the core backtracking algorithm:
 * 1. Base case: when all course groups have been processed, save valid schedule
 * 2. For each class in current group: check compatibility with existing schedule
 * 3. If compatible: add to schedule and recurse to next group
 * 4. Backtrack: remove class and try next option in current group
 * 5. Ensures exactly one class is selected from each course group
 * 
 * @param {&[&Class]} flattened_classes - Flat array of all class references for efficient access
 * @param {&[Vec<usize>]} class_indices - Index mapping from course groups to flattened array positions
 * @param {&mut Vec<usize>} current_schedule - Current partial schedule being built (indices only)
 * @param {usize} current_group - Index of course group currently being processed
 * @param {&mut Vec<Vec<usize>>} results - Accumulator for all valid schedule combinations found
 * @param {usize} total_groups - Total number of course groups that must be included in schedule
 */
fn backtrack(
    flattened_classes: &[&Class],
    class_indices: &[Vec<usize>],
    current_schedule: &mut Vec<usize>,
    current_group: usize,
    results: &mut Vec<Vec<usize>>,
    total_groups: usize,
) {
    // Base case: we've considered all course groups
    // A valid schedule must have exactly one class from each group.
    if current_group == total_groups {
        // Since we only recurse after adding a class for the *previous* group,
        // and we start at group 0, reaching here means we potentially have
        // a full schedule of length `total_groups`.
        // An extra check isn't strictly necessary if the logic is correct,
        // but it doesn't hurt.
        if current_schedule.len() == total_groups {
             results.push(current_schedule.clone());
        }
        return;
    }

    // Try each class in the current group
    for &class_idx in &class_indices[current_group] {
        if is_compatible(flattened_classes, class_idx, current_schedule) {
            // If compatible, add it to the current schedule
            current_schedule.push(class_idx);
            // Recurse for the next group
            backtrack(
                flattened_classes,
                class_indices,
                current_schedule,
                current_group + 1, // Move to the next group
                results,
                total_groups
            );
            // Backtrack: remove the class to explore other possibilities
            current_schedule.pop();
        }
        // If not compatible, do nothing and just try the next class in this group's loop.
    }
}

/**
 * Checks if a new class is compatible with all classes in the current schedule
 * 
 * This function performs comprehensive time conflict detection:
 * 1. Compares new class against every class already in the schedule
 * 2. For each pair: checks all sections of both classes for conflicts
 * 3. For each day of the week: validates time ranges don't overlap
 * 4. Uses standard interval overlap detection (exclusive boundaries)
 * 5. Returns false immediately if any conflict is found
 * 
 * @param {&[&Class]} all_classes - Flat array of all class references
 * @param {usize} new_class_idx - Index of new class being considered for addition
 * @param {&[usize]} schedule_indices - Indices of classes already in current schedule
 * @returns {bool} True if new class has no time conflicts, false if any conflict detected
 */
fn is_compatible(all_classes: &[&Class], new_class_idx: usize, schedule_indices: &[usize]) -> bool {
    let new_class = all_classes[new_class_idx];

    for &existing_idx in schedule_indices {
        let existing_class = all_classes[existing_idx];

        // Check for time conflicts between all sections of both classes
        for new_section in &new_class.classes {
            for existing_section in &existing_class.classes {
                // Check for time conflicts on any day they share
                for day_idx in 0..5 { // Assuming Mon-Fri
                    let new_day = new_section.days[day_idx];
                    let existing_day = existing_section.days[day_idx];

                    // Skip if either class doesn't have a session on this day
                    if !new_day.1 || !existing_day.1 { // .1 is likely a boolean flag for meeting day
                        continue;
                    }

                    // Extract time ranges (.0 is likely a tuple (start_time, end_time))
                    let (new_start, new_end) = (new_day.0.0, new_day.0.1);
                    let (existing_start, existing_end) = (existing_day.0.0, existing_day.0.1);

                    // Check for time overlap. Standard check is: startA < endB && startB < endA
                    // Your check: new_start <= existing_end && new_end >= existing_start
                    // This counts touching boundaries (e.g., 10:00 end, 10:00 start) as a conflict.
                    // This might be intended, but double-check if that's the desired behavior.
                    if new_start < existing_end && new_end > existing_start { // Using standard non-inclusive boundary check
                        return false; // Conflict found
                    }
                }
            }
        }
    }

    true // No conflicts found with any existing class in the schedule
}