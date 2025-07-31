//! Event processing module for calendar display and layout calculations
//! 
//! This module transforms raw event data into calendar-ready format with positioning,
//! overlap detection, and layout calculations. It handles the complex logic of organizing
//! events by day, detecting time overlaps, and calculating CSS positioning for proper
//! calendar grid display.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::{Event};

// === CALENDAR DISPLAY CONSTANTS ===

/** Starting hour for calendar display (8 AM) */
const START_HOUR: i32 = 8;

/** Ending hour for calendar display (8 PM) */
const END_HOUR: i32 = 20;

/** Total minutes displayed in calendar view (12 hours * 60 minutes) */
const TOTAL_MINUTES_IN_VIEW: i32 = (END_HOUR - START_HOUR) * 60;

// === DATA STRUCTURES ===

/**
 * Processed event structure with calendar display properties
 * 
 * This structure extends the basic Event with additional fields needed for calendar rendering:
 * - Formatted time strings for display
 * - CSS positioning properties (width, left, top, height)
 * - Duplicate time fields for different use cases (int vs formatted)
 */
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProcessedEvent {
    /** Unique event identifier */
    pub id: String,
    /** Event title for display */
    pub title: String,
    /** Original start time as integer (HHMM format) */
    #[serde(rename = "startTime")]
    pub start_time: i32,
    /** Original end time as integer (HHMM format) */
    #[serde(rename = "endTime")]
    pub end_time: i32,
    /** Day bitmask indicating which days event occurs */
    pub day: i32,
    /** Professor/instructor name */
    pub professor: String,
    /** Event description */
    pub description: String,
    /** Processed start time as integer (normalized) */
    #[serde(rename = "startTimeInt")]
    pub start_time_int: i32,
    /** Processed end time as integer (normalized) */
    #[serde(rename = "endTimeInt")]
    pub end_time_int: i32,
    /** Start time formatted as HH:MM string for display */
    #[serde(rename = "startTimeFormatted")]
    pub start_time_formatted: String,
    /** End time formatted as HH:MM string for display */
    #[serde(rename = "endTimeFormatted")]
    pub end_time_formatted: String,
    /** CSS width percentage for calendar positioning */
    pub width: String,
    /** CSS left offset percentage for calendar positioning */
    pub left: String,
    /** CSS top position percentage for calendar positioning */
    #[serde(rename = "topPosition")]
    pub top_position: String,
    /** CSS height percentage for calendar positioning */
    #[serde(rename = "heightPosition")]
    pub height_position: String,
}

/**
 * Result structure containing processed events organized for calendar display
 * 
 * Separates events into two categories:
 * - Timed events: Events with specific start/end times that appear in time slots
 * - No-time events: All-day or unscheduled events that appear in a separate area
 */
#[derive(Serialize, Deserialize, Clone)]
pub struct ProcessedEventsResult {
    /** Timed events organized by day key (0-6 for days of week) */
    #[serde(rename = "eventsByDay")]
    pub events_by_day: HashMap<String, Vec<ProcessedEvent>>,
    /** No-time events organized by day key */
    #[serde(rename = "noTimeEventsByDay")]
    pub no_time_events_by_day: HashMap<String, Vec<ProcessedEvent>>,
}

// === EVENT PROCESSOR IMPLEMENTATION ===

/**
 * Main event processing service for calendar display preparation
 * 
 * This processor handles the complete transformation pipeline from raw events
 * to calendar-ready data with proper positioning and overlap handling.
 */
pub struct EventProcessor;

impl EventProcessor {
    /**
     * Formats time integer to HH:MM string representation
     * 
     * Converts time integers in HHMM format (e.g., 930 for 9:30) to
     * properly formatted time strings with leading zeros and colon separator.
     * 
     * @param {i32} time_int - Time as integer in HHMM format
     * @returns {String} Formatted time string (e.g., "09:30")
     */
    fn format_time_int_to_string(time_int: i32) -> String {
        // Handle invalid or zero times
        if time_int <= 0 {
            return "00:00".to_string();
        }
        // Ensure 4-digit format with leading zeros
        let time_str = format!("{time_int:04}");
        // Insert colon between hours and minutes
        format!("{}:{}", &time_str[0..2], &time_str[2..4])
    }

    /**
     * Calculates minutes elapsed since calendar start hour
     * 
     * Converts time integers to minutes offset from START_HOUR for positioning
     * calculations. This enables percentage-based positioning in the calendar grid.
     * 
     * @param {i32} time_int - Time as integer in HHMM format
     * @returns {i32} Minutes since START_HOUR (can be negative for early times)
     */
    fn get_minutes_since_start(time_int: i32) -> i32 {
        // Handle invalid times
        if time_int <= 0 {
            return 0;
        }
        // Extract hours and minutes from HHMM format
        let hours = time_int / 100;
        let minutes = time_int % 100;
        // Calculate total minutes and subtract calendar start offset
        (hours * 60 + minutes) - (START_HOUR * 60)
    }

    /**
     * Converts raw Event to ProcessedEvent with initial formatting
     * 
     * Performs the basic transformation from database Event structure to
     * calendar-ready ProcessedEvent with formatted times and default positioning.
     * Normalizes time values and sets up initial CSS properties.
     * 
     * @param {Event} event - Raw event from database
     * @returns {ProcessedEvent} Event with formatting and default positioning
     */
    fn event_to_processed_event(event: Event) -> ProcessedEvent {
        // Normalize time values (ensure non-negative)
        let start_time_int = if event.start_time > 0 { event.start_time } else { 0 };
        let end_time_int = if event.end_time > 0 { event.end_time } else { 0 };

        ProcessedEvent {
            // Copy basic event data
            id: event.id,
            title: event.title,
            start_time: event.start_time,
            end_time: event.end_time,
            day: event.day,
            professor: event.professor,
            description: event.description,
            // Set normalized time values
            start_time_int,
            end_time_int,
            // Format times for display
            start_time_formatted: Self::format_time_int_to_string(start_time_int),
            end_time_formatted: Self::format_time_int_to_string(end_time_int),
            // Set default CSS positioning (will be calculated later)
            width: "100%".to_string(),
            left: "0%".to_string(),
            top_position: "0%".to_string(),
            height_position: "0%".to_string(),
        }
    }

    /**
     * Determines if an event has valid time assignments
     * 
     * Checks whether an event has meaningful start and end times.
     * Events without valid times are treated as "no-time" events and
     * displayed in a separate area of the calendar.
     * 
     * @param {&ProcessedEvent} event - Event to validate
     * @returns {bool} True if event has valid start and end times
     */
    fn has_valid_time(event: &ProcessedEvent) -> bool {
        // Both start and end times must be positive
        event.start_time_int > 0 && event.end_time_int > 0
    }

    /**
     * Groups events by day based on day bitmask and separates by time validity
     * 
     * Processes the day bitmask to determine which days each event occurs on,
     * then separates events into timed and no-time categories. Each event may
     * appear on multiple days if its bitmask indicates recurring occurrences.
     * 
     * @param {Vec<ProcessedEvent>} events - All processed events to group
     * @returns {(HashMap<String, Vec<ProcessedEvent>>, HashMap<String, Vec<ProcessedEvent>>)} Tuple of (timed_events_by_day, no_time_events_by_day)
     */
    fn group_events_by_day(events: Vec<ProcessedEvent>) -> (HashMap<String, Vec<ProcessedEvent>>, HashMap<String, Vec<ProcessedEvent>>) {
        let mut events_by_day: HashMap<String, Vec<ProcessedEvent>> = HashMap::new();
        let mut no_time_events_by_day: HashMap<String, Vec<ProcessedEvent>> = HashMap::new();

        for event in events {
            // Check each bit in the day bitmask (0-6 for days of week)
            for day_bit_index in 0..7 {
                // Test if this day bit is set in the bitmask
                if (event.day & (1 << day_bit_index)) != 0 {
                    let day_key = day_bit_index.to_string();
                    
                    // Categorize based on time validity
                    if Self::has_valid_time(&event) {
                        // Add to timed events for this day
                        events_by_day
                            .entry(day_key)
                            .or_default()
                            .push(event.clone());
                    } else {
                        // Add to no-time events for this day
                        no_time_events_by_day
                            .entry(day_key)
                            .or_default()
                            .push(event.clone());
                    }
                }
            }
        }

        (events_by_day, no_time_events_by_day)
    }

    /**
     * Calculates overlap groups and horizontal positioning for events in a single day
     * 
     * This function implements a sophisticated overlap detection algorithm:
     * 1. Sorts events by start time for chronological processing
     * 2. Groups overlapping events together using interval overlap detection
     * 3. Calculates width and horizontal offset for each event based on group size
     * 4. Ensures overlapping events are displayed side-by-side without visual conflicts
     * 
     * @param {&mut Vec<ProcessedEvent>} day_events - Events for a single day (modified in-place)
     */
    fn calculate_overlap_groups(day_events: &mut [ProcessedEvent]) {
        // Sort events by start time for chronological processing
        day_events.sort_by(|a, b| a.start_time_int.cmp(&b.start_time_int));

        // Track groups of overlapping events
        let mut groups: Vec<Vec<usize>> = Vec::new();
        let mut current_group: Vec<usize> = Vec::new();

        for (i, event) in day_events.iter().enumerate() {
            let event_start_minutes = Self::get_minutes_since_start(event.start_time_int);
            
            // Check if this event overlaps with any event in the current group
            let overlaps_with_group = current_group.iter().any(|&group_event_idx| {
                let group_event = &day_events[group_event_idx];
                let group_event_end_minutes = Self::get_minutes_since_start(group_event.end_time_int);
                // Overlap occurs if new event starts before existing event ends
                event_start_minutes < group_event_end_minutes
            });

            if overlaps_with_group {
                // Add to current overlap group
                current_group.push(i);
            } else {
                // No overlap - finalize current group and start new one
                if !current_group.is_empty() {
                    groups.push(current_group.clone());
                }
                current_group = vec![i];
            }
        }
        
        // Don't forget the last group
        if !current_group.is_empty() {
            groups.push(current_group);
        }

        // Apply width and left positioning based on overlap groups
        for group in groups {
            let group_width = 100.0; // Full width available for the group
            let event_width = group_width / group.len() as f64; // Equal width distribution
            
            // Set positioning for each event in the group
            for (index, &event_idx) in group.iter().enumerate() {
                day_events[event_idx].width = format!("{event_width:.2}%");
                day_events[event_idx].left = format!("{:.2}%", index as f64 * event_width);
            }
        }
    }

    /**
     * Calculates vertical positioning for events based on time ranges
     * 
     * Converts event start times and durations to CSS percentage values
     * for proper vertical positioning in the calendar grid. Uses the
     * calendar's time range (START_HOUR to END_HOUR) as the basis for
     * percentage calculations.
     * 
     * @param {&mut Vec<ProcessedEvent>} day_events - Events to position (modified in-place)
     */
    fn calculate_positioning(day_events: &mut [ProcessedEvent]) {
        for event in day_events.iter_mut() {
            // Calculate time offsets in minutes from calendar start
            let start_minutes = Self::get_minutes_since_start(event.start_time_int);
            let end_minutes = Self::get_minutes_since_start(event.end_time_int);
            let duration = (end_minutes - start_minutes).max(0); // Ensure non-negative duration

            // Convert to percentage of total calendar view
            event.top_position = format!("{:.2}%", (start_minutes as f64 / TOTAL_MINUTES_IN_VIEW as f64) * 100.0);
            event.height_position = format!("{:.2}%", (duration as f64 / TOTAL_MINUTES_IN_VIEW as f64) * 100.0);
        }
    }

    /**
     * Main processing function that orchestrates the complete event transformation pipeline
     * 
     * This function coordinates the entire process of converting raw events into
     * calendar-ready data with proper positioning and overlap handling:
     * 1. Handles empty input gracefully
     * 2. Converts raw events to processed format with initial formatting
     * 3. Groups events by day and separates timed vs no-time events
     * 4. For each day: calculates overlap groups and positioning
     * 5. Returns organized data ready for calendar rendering
     * 
     * @param {Vec<Event>} raw_events - Raw events from database
     * @returns {ProcessedEventsResult} Fully processed events organized for calendar display
     */
    pub fn process_events(raw_events: Vec<Event>) -> ProcessedEventsResult {
        // Handle empty input case
        if raw_events.is_empty() {
            return ProcessedEventsResult {
                events_by_day: HashMap::new(),
                no_time_events_by_day: HashMap::new(),
            };
        }

        // Step 1: Convert raw events to processed format
        let processed_events: Vec<ProcessedEvent> = raw_events
            .into_iter()
            .map(Self::event_to_processed_event)
            .collect();

        // Step 2: Group events by day and separate by time validity
        let (mut events_by_day, no_time_events_by_day) = Self::group_events_by_day(processed_events);

        // Step 3: Process each day's timed events for positioning and overlap handling
        for day_events in events_by_day.values_mut() {
            // Calculate horizontal positioning based on overlaps
            Self::calculate_overlap_groups(day_events);
            // Calculate vertical positioning based on time ranges
            Self::calculate_positioning(day_events);
        }

        // Return fully processed and positioned events
        ProcessedEventsResult {
            events_by_day,
            no_time_events_by_day,
        }
    }
}