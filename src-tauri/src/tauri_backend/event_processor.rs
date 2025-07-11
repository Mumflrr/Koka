use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::{Event};

const START_HOUR: i32 = 8;
const END_HOUR: i32 = 20;
const TOTAL_MINUTES_IN_VIEW: i32 = (END_HOUR - START_HOUR) * 60;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProcessedEvent {
    pub id: String,
    pub title: String,
    #[serde(rename = "startTime")]
    pub start_time: i32,
    #[serde(rename = "endTime")]
    pub end_time: i32,
    pub day: i32,
    pub professor: String,
    pub description: String,
    #[serde(rename = "startTimeInt")]
    pub start_time_int: i32,
    #[serde(rename = "endTimeInt")]
    pub end_time_int: i32,
    #[serde(rename = "startTimeFormatted")]
    pub start_time_formatted: String,
    #[serde(rename = "endTimeFormatted")]
    pub end_time_formatted: String,
    pub width: String,
    pub left: String,
    #[serde(rename = "topPosition")]
    pub top_position: String,
    #[serde(rename = "heightPosition")]
    pub height_position: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ProcessedEventsResult {
    #[serde(rename = "eventsByDay")]
    pub events_by_day: HashMap<String, Vec<ProcessedEvent>>,
    #[serde(rename = "noTimeEventsByDay")]
    pub no_time_events_by_day: HashMap<String, Vec<ProcessedEvent>>,
}

pub struct EventProcessor;

impl EventProcessor {
    /// Format HHmm integer to "HH:mm" string
    fn format_time_int_to_string(time_int: i32) -> String {
        if time_int <= 0 {
            return "00:00".to_string();
        }
        let time_str = format!("{:04}", time_int);
        format!("{}:{}", &time_str[0..2], &time_str[2..4])
    }

    /// Get minutes since calendar start hour from an HHmm integer
    fn get_minutes_since_start(time_int: i32) -> i32 {
        if time_int <= 0 {
            return 0;
        }
        let hours = time_int / 100;
        let minutes = time_int % 100;
        (hours * 60 + minutes) - (START_HOUR * 60)
    }

    /// Convert Event to ProcessedEvent with initial formatting
    fn event_to_processed_event(event: Event) -> ProcessedEvent {
        let start_time_int = if event.start_time > 0 { event.start_time } else { 0 };
        let end_time_int = if event.end_time > 0 { event.end_time } else { 0 };

        ProcessedEvent {
            id: event.id,
            title: event.title,
            start_time: event.start_time,
            end_time: event.end_time,
            day: event.day,
            professor: event.professor,
            description: event.description,
            start_time_int,
            end_time_int,
            start_time_formatted: Self::format_time_int_to_string(start_time_int),
            end_time_formatted: Self::format_time_int_to_string(end_time_int),
            width: "100%".to_string(),
            left: "0%".to_string(),
            top_position: "0%".to_string(),
            height_position: "0%".to_string(),
        }
    }

    /// Check if an event has valid time assignments
    fn has_valid_time(event: &ProcessedEvent) -> bool {
        event.start_time_int > 0 && event.end_time_int > 0
    }

    /// Group events by day based on day bitmask
    fn group_events_by_day(events: Vec<ProcessedEvent>) -> (HashMap<String, Vec<ProcessedEvent>>, HashMap<String, Vec<ProcessedEvent>>) {
        let mut events_by_day: HashMap<String, Vec<ProcessedEvent>> = HashMap::new();
        let mut no_time_events_by_day: HashMap<String, Vec<ProcessedEvent>> = HashMap::new();

        for event in events {
            for day_bit_index in 0..7 {
                if (event.day & (1 << day_bit_index)) != 0 {
                    let day_key = day_bit_index.to_string();
                    
                    if Self::has_valid_time(&event) {
                        events_by_day
                            .entry(day_key)
                            .or_insert_with(Vec::new)
                            .push(event.clone());
                    } else {
                        no_time_events_by_day
                            .entry(day_key)
                            .or_insert_with(Vec::new)
                            .push(event.clone());
                    }
                }
            }
        }

        (events_by_day, no_time_events_by_day)
    }

    /// Calculate overlap groups for events in a day
    fn calculate_overlap_groups(day_events: &mut Vec<ProcessedEvent>) {
        // Sort by start time
        day_events.sort_by(|a, b| a.start_time_int.cmp(&b.start_time_int));

        let mut groups: Vec<Vec<usize>> = Vec::new();
        let mut current_group: Vec<usize> = Vec::new();

        for (i, event) in day_events.iter().enumerate() {
            let event_start_minutes = Self::get_minutes_since_start(event.start_time_int);
            
            let overlaps_with_group = current_group.iter().any(|&group_event_idx| {
                let group_event = &day_events[group_event_idx];
                let group_event_end_minutes = Self::get_minutes_since_start(group_event.end_time_int);
                event_start_minutes < group_event_end_minutes
            });

            if overlaps_with_group {
                current_group.push(i);
            } else {
                if !current_group.is_empty() {
                    groups.push(current_group.clone());
                }
                current_group = vec![i];
            }
        }
        
        if !current_group.is_empty() {
            groups.push(current_group);
        }

        // Apply width and left positioning based on groups
        for group in groups {
            let group_width = 100.0;
            let event_width = group_width / group.len() as f64;
            
            for (index, &event_idx) in group.iter().enumerate() {
                day_events[event_idx].width = format!("{:.2}%", event_width);
                day_events[event_idx].left = format!("{:.2}%", index as f64 * event_width);
            }
        }
    }

    /// Calculate positioning for events
    fn calculate_positioning(day_events: &mut Vec<ProcessedEvent>) {
        for event in day_events.iter_mut() {
            let start_minutes = Self::get_minutes_since_start(event.start_time_int);
            let end_minutes = Self::get_minutes_since_start(event.end_time_int);
            let duration = (end_minutes - start_minutes).max(0);

            event.top_position = format!("{:.2}%", (start_minutes as f64 / TOTAL_MINUTES_IN_VIEW as f64) * 100.0);
            event.height_position = format!("{:.2}%", (duration as f64 / TOTAL_MINUTES_IN_VIEW as f64) * 100.0);
        }
    }

    /// Main processing function
    pub fn process_events(raw_events: Vec<Event>) -> ProcessedEventsResult {
        if raw_events.is_empty() {
            return ProcessedEventsResult {
                events_by_day: HashMap::new(),
                no_time_events_by_day: HashMap::new(),
            };
        }

        // Convert to ProcessedEvent
        let processed_events: Vec<ProcessedEvent> = raw_events
            .into_iter()
            .map(Self::event_to_processed_event)
            .collect();

        // Group by day
        let (mut events_by_day, no_time_events_by_day) = Self::group_events_by_day(processed_events);

        // Process each day's events
        for day_events in events_by_day.values_mut() {
            Self::calculate_overlap_groups(day_events);
            Self::calculate_positioning(day_events);
        }

        ProcessedEventsResult {
            events_by_day,
            no_time_events_by_day,
        }
    }
}