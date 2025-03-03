import { parse } from 'date-fns';

const processEvents = (rawEvents) => {
    if (!rawEvents || rawEvents.length === 0) return [];

    const parseTime = (timeStr) => parse(timeStr, 'HH:mm', new Date());

    const eventsByDay = rawEvents.reduce((acc, event) => {
        acc[event.day] = acc[event.day] || [];
        acc[event.day].push(event);
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
    });

    return rawEvents;
};

export default processEvents;