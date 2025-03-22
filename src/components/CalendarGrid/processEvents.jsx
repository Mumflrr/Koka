import { parse } from 'date-fns';

const startHour = 8;
const endHour = 20;
const parseTime = (timeStr) => parse(timeStr, 'HH:mm', new Date());

const getMinutesSinceStart = (timeStr) => {
    const time = parseTime(timeStr);
    return time.getHours() * 60 + time.getMinutes() - startHour * 60;
};

const processEvents = (rawEvents) => {
    if (!rawEvents || rawEvents.length === 0) return [];

    // First, ensure all events have unique IDs
    const eventsWithIds = rawEvents.map(event => {
        if (!event.id || event.id === undefined) {
            // Generate a unique ID if none exists
            return {
                ...event,
                id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
            };
        }
        return event;
    });

    const totalMinutes = (endHour - startHour) * 60;

    // Create a map to store events for each day
    // Use a composite key that includes the event ID to prevent duplication
    const eventsByDayMap = new Map();

    eventsWithIds.forEach(event => {
        // Process each day bit (Sunday = bit 0, Saturday = bit 6)
        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            // Check if the current day bit is set (1)
            if ((event.day & (1 << dayIndex)) !== 0) {
                // Convert dayIndex to a consistent string key
                const dayKey = dayIndex.toString();
                
                // Create a unique key for this event in this day
                const eventKey = `${dayKey}-${event.id}`;
                
                // Skip if we've already processed this exact event for this day
                if (eventsByDayMap.has(eventKey)) continue;
                
                // Get or create the array for this day
                if (!eventsByDayMap.has(dayKey)) {
                    eventsByDayMap.set(dayKey, []);
                }
                
                // Clone the event for each day it occurs on
                const eventCopy = { ...event };
                
                // Add the event to this day's array
                eventsByDayMap.get(dayKey).push(eventCopy);
                
                // Mark this event as processed for this day
                eventsByDayMap.set(eventKey, true);
            }
        }
    });

    // Convert the map to an object for easier processing
    const eventsByDay = {};
    for (const [key, value] of eventsByDayMap.entries()) {
        if (Array.isArray(value)) {
            eventsByDay[key] = value;
        }
    }

    // Process each day's events for layout
    Object.keys(eventsByDay).forEach(day => {
        const dayEvents = eventsByDay[day];
    
        // Sort events by start time
        dayEvents.sort((a, b) => {
            const timeA = parseTime(a.startTime);
            const timeB = parseTime(b.startTime);
            return timeA.getTime() - timeB.getTime();
        });

        // Group overlapping events
        let currentGroup = [];
        let groups = [];
    
        dayEvents.forEach((event) => {
            const eventStart = parseTime(event.startTime);
            const overlapsWithGroup = currentGroup.some(groupEvent => {
                const groupEventEnd = parseTime(groupEvent.endTime);
                return eventStart < groupEventEnd;
            });

            if (overlapsWithGroup) {
                currentGroup.push(event);
            } else {
                if (currentGroup.length > 0) {
                    groups.push([...currentGroup]);
                }
                currentGroup = [event];
            }
        });

        if (currentGroup.length > 0) {
            groups.push(currentGroup);
        }

        // Calculate horizontal positioning for each group
        groups.forEach(group => {
            const groupWidth = 100;
            const eventWidth = groupWidth / group.length;
        
            group.forEach((event, index) => {
                event.width = `${eventWidth}%`;
                event.left = `${index * eventWidth}%`;
            });
        });

        // Ensure all events have width and left properties
        dayEvents.forEach(event => {
            if (!event.width) {
                event.width = '100%';
                event.left = '0%';
            }
        });

        // Calculate vertical positioning
        eventsByDay[day].forEach(event => {
            const startMinutes = getMinutesSinceStart(event.startTime);
            const endMinutes = getMinutesSinceStart(event.endTime);
            const duration = endMinutes - startMinutes;
            
            event.topPosition = `${(startMinutes / totalMinutes) * 100}%`;
            event.heightPosition = `${(duration / totalMinutes) * 100}%`;
        });
    });

    // Flatten all events into a single array
    return Object.values(eventsByDay).flat();
};

export default processEvents;