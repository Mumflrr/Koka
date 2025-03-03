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

    const totalMinutes = (endHour - startHour) * 60;

    const parseTime = (timeStr) => parse(timeStr, 'HH:mm', new Date());

    const eventsByDay = rawEvents.reduce((acc, event) => {
        // Process each day bit (Sunday = bit 0, Saturday = bit 6)
        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            // Check if the current day bit is set (1)
            if ((event.day & (1 << dayIndex)) !== 0) {
                // Convert dayIndex to a consistent string key
                const dayKey = dayIndex.toString();
                
                // Initialize the array for this day if it doesn't exist
                acc[dayKey] = acc[dayKey] || [];
                
                // Clone the event for each day it occurs on
                const eventCopy = { ...event };
                
                // Add the event to this day's array
                acc[dayKey].push(eventCopy);
            }
        }
        return acc;
    }, {});

    Object.keys(eventsByDay).forEach(day => {
        const dayEvents = eventsByDay[day];
    
        dayEvents.sort((a, b) => {
            const timeA = parseTime(a.startTime);
            const timeB = parseTime(b.startTime);
            return timeA.getTime() - timeB.getTime();
        });

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

        groups.forEach(group => {
            const groupWidth = 100;
            const eventWidth = groupWidth / group.length;
        
            group.forEach((event, index) => {
                event.width = `${eventWidth}%`;
                event.left = `${index * eventWidth}%`;
            });
        });

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

    return Object.values(eventsByDay).flat();
};

export default processEvents;