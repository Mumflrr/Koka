// src/components/CalendarGrid/processEvents.jsx

const startHour = 8; // Define startHour for calculations

// Helper to convert HHmm integer to "HH:mm" string
const formatTimeIntToString = (timeInt) => {
    if (timeInt === null || timeInt === undefined || timeInt === -1) {
        return '00:00'; // Or handle as an error or invalid time
    }
    const timeStr = String(timeInt).padStart(4, '0');
    return `${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}`;
};

// Helper to get minutes since calendar start hour from an HHmm integer
const getMinutesSinceStart = (timeInt) => {
    if (timeInt === null || timeInt === undefined || timeInt === -1) {
        return 0; // Or handle appropriately
    }
    const hours = Math.floor(timeInt / 100);
    const minutes = timeInt % 100;
    return (hours * 60 + minutes) - (startHour * 60);
};

const processEvents = (rawEvents) => {
    if (!rawEvents || rawEvents.length === 0) {
        return { eventsByDay: {}, noTimeEventsByDay: {} };
    }

    const eventsWithIds = rawEvents.map(event => {
        const startTimeInt = typeof event.startTime === 'number' ? event.startTime : 0;
        const endTimeInt = typeof event.endTime === 'number' ? event.endTime : 0;
        return {
            ...event,
            id: event.id || `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
            startTimeInt: startTimeInt,
            endTimeInt: endTimeInt,
            startTime: formatTimeIntToString(startTimeInt),
            endTime: formatTimeIntToString(endTimeInt),
        };
    });

    const totalMinutesInView = (20 - startHour) * 60; // Assuming endHour is 20
    const eventsByDay = {};
    const noTimeEventsByDay = {};

    eventsWithIds.forEach(event => {
        for (let dayBitIndex = 0; dayBitIndex < 7; dayBitIndex++) {
            if ((event.day & (1 << dayBitIndex)) !== 0) {
                const dayKey = dayBitIndex.toString();
                // If event has no assigned time (startTimeInt or endTimeInt is 0 or -1)
                if (
                    event.startTimeInt === 0 ||
                    event.endTimeInt === 0 ||
                    event.startTimeInt === -1 ||
                    event.endTimeInt === -1
                ) {
                    if (!noTimeEventsByDay[dayKey]) {
                        noTimeEventsByDay[dayKey] = [];
                    }
                    if (!noTimeEventsByDay[dayKey].find(e => e.id === event.id)) {
                        noTimeEventsByDay[dayKey].push({ ...event });
                    }
                } else {
                    if (!eventsByDay[dayKey]) {
                        eventsByDay[dayKey] = [];
                    }
                    if (!eventsByDay[dayKey].find(e => e.id === event.id)) {
                        eventsByDay[dayKey].push({ ...event });
                    }
                }
            }
        }
    });

    Object.keys(eventsByDay).forEach(dayKey => {
        const dayEvents = eventsByDay[dayKey];

        // Sort by integer start times for accuracy
        dayEvents.sort((a, b) => a.startTimeInt - b.startTimeInt);

        let currentGroup = [];
        let groups = [];
        dayEvents.forEach((event) => {
            // Use integer times for overlap calculation
            const eventStartMinutes = getMinutesSinceStart(event.startTimeInt);
            
            const overlapsWithGroup = currentGroup.some(groupEvent => {
                const groupEventEndMinutes = getMinutesSinceStart(groupEvent.endTimeInt);
                // Check if eventStart is before groupEventEnd
                return eventStartMinutes < groupEventEndMinutes; 
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

        groups.forEach(group => {
            const groupWidth = 100; // Percentage
            const eventWidth = groupWidth / group.length;
            group.forEach((eventInGroup, index) => {
                eventInGroup.width = `${eventWidth}%`;
                eventInGroup.left = `${index * eventWidth}%`;
            });
        });

        dayEvents.forEach(event => {
            if (!event.width) { // Should be set by grouping logic
                event.width = '100%';
                event.left = '0%';
            }
            const startMinutes = getMinutesSinceStart(event.startTimeInt);
            const endMinutes = getMinutesSinceStart(event.endTimeInt);
            const duration = Math.max(0, endMinutes - startMinutes); // Ensure duration is not negative

            event.topPosition = `${(startMinutes / totalMinutesInView) * 100}%`;
            event.heightPosition = `${(duration / totalMinutesInView) * 100}%`;
        });
    });

    return { eventsByDay, noTimeEventsByDay };
};

export default processEvents;