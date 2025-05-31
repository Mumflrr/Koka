// src/components/CalendarGrid/processEvents.jsx
import { parse } from 'date-fns';

const startHour = 8;
const endHour = 20;
const parseTime = (timeStr) => parse(timeStr, 'HH:mm', new Date());

const getMinutesSinceStart = (timeStr) => {
    const time = parseTime(timeStr);
    return time.getHours() * 60 + time.getMinutes() - startHour * 60;
};

const processEvents = (rawEvents) => {
    if (!rawEvents || rawEvents.length === 0) return {}; // Return an empty object

    const eventsWithIds = rawEvents.map(event => {
        if (!event.id || event.id === undefined) {
            return {
                ...event,
                id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
            };
        }
        return event;
    });

    const totalMinutes = (endHour - startHour) * 60;
    const eventsByDay = {}; // Key: dayBitIndex.toString() (e.g. "1" for Mon), Value: Array of event objects

    eventsWithIds.forEach(event => {
        for (let dayBitIndex = 0; dayBitIndex < 7; dayBitIndex++) { // 0=Sun, 1=Mon, ..., 6=Sat
            if ((event.day & (1 << dayBitIndex)) !== 0) {
                const dayKey = dayBitIndex.toString();
                
                if (!eventsByDay[dayKey]) {
                    eventsByDay[dayKey] = [];
                }
                
                // Add a copy of the event to this specific day's list
                // Ensure the event isn't already added to this day's list if rawEvents had true duplicates
                // This check assumes event.id is globally unique for distinct event entities.
                if (!eventsByDay[dayKey].find(e => e.id === event.id)) {
                    eventsByDay[dayKey].push({ ...event });
                }
            }
        }
    });

    Object.keys(eventsByDay).forEach(dayKey => {
        const dayEvents = eventsByDay[dayKey];
    
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
                if (currentGroup.length > 0) groups.push([...currentGroup]);
                currentGroup = [event];
            }
        });
        if (currentGroup.length > 0) groups.push(currentGroup);

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
            const startMinutes = getMinutesSinceStart(event.startTime);
            const endMinutes = getMinutesSinceStart(event.endTime);
            const duration = endMinutes - startMinutes;
            event.topPosition = `${(startMinutes / totalMinutes) * 100}%`;
            event.heightPosition = `${(duration / totalMinutes) * 100}%`;
        });
    });

    return eventsByDay; // Return the object mapping day keys to event arrays
};

export default processEvents;