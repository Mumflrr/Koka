import React, { useState, useEffect, useRef } from 'react';
import {addMinutes, parse, isWithinInterval } from 'date-fns';
import ss from './Scheduler.module.css';
import Sidebar from "../Sidebar/Sidebar";

const Scheduler = () => {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const startHour = 8;
  const endHour = 20;
  const totalMinutes = (endHour - startHour) * 60;  
  const containerRef = useRef(null);
  const [events, setEvents] = useState([
    {
      id: 1,
      title: 'TEST',
      startTime: '09:15',
      endTime: '13:00',
      day: 2,
      professor: -1,
      description: -1
    },
    {
      id: 2,
      title: 'TEST1',
      startTime: '13:01',
      endTime: '14:00',
      day: 2,
      professor: "Albemarle",
      description: -1
    },
    {
      id: 3,
      title: 'TEST2',
      startTime: '13:59',
      endTime: '15:04',
      day: 2,
      professor: -1,
      description: -1
    }
  ]);

  const parseTime = (timeStr) => parse(timeStr, 'HH:mm', new Date());

  // Calculate the minutes since start of day
  const getMinutesSinceStart = (timeStr) => {
    const time = parseTime(timeStr);
    return time.getHours() * 60 + time.getMinutes() - startHour * 60;
  };

  // Process events to add positioning information
  const processEvents = (rawEvents) => {
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

  useEffect(() => {
    setEvents(prevEvents => processEvents([...prevEvents]));
  }, []);

  const calculateEventStyle = (startTime, endTime, eventIndex) => {
    const startMinutes = getMinutesSinceStart(startTime);
    const endMinutes = getMinutesSinceStart(endTime);
    const duration = endMinutes - startMinutes;
    
    const top = (startMinutes / totalMinutes) * 100;
    const height = (duration / totalMinutes) * 100;

    return {
      top: `${top}%`,
      height: `${height}%`,
      zIndex: eventIndex + 1,
    };
  };

  return (
    <div className={ss['scheduler']}>
        <Sidebar/>
        <div className={ss['calendar-wrapper']} ref={containerRef}>
            <div className={ss['calendar-grid']}>
                {/* Header */}
                <div className={ss['header-spacer']} />
                {days.map(day => (
                <div key={day} className={ss['header-cell']}>
                    <span>{day}</span>
                </div>
                ))}

                {/* Time slots */}
                <div className={ss['time-slots-container']}>
                {/* Time labels */}
                <div className={ss['time-labels-column']}>
                    {Array.from({ length: endHour - startHour + 1 }).map((_, i) => (
                    <div key={i} className={ss['hour-label']}>
                        <span>{`${startHour + i}:00`}</span>
                    </div>
                    ))}
                </div>

                {/* Day columns */}
                {days.map((_, dayIndex) => (
                    <div key={dayIndex} className={ss['day-column']}>
                    {/* Grid lines */}
                    {Array.from({ length: (endHour - startHour) * 2 }).map((_, i) => (
                        <div key={i} className={ss['grid-line']} />
                    ))}
                    
                    {/* Events */}
                    {events
                        .filter(event => event.day === dayIndex)
                        .map((event, eventIndex) => {
                        const eventStyle = {
                            ...calculateEventStyle(event.startTime, event.endTime, eventIndex),
                            width: event.width,
                            left: event.left,
                        };

                        return (
                            <div
                            key={event.id}
                            className={`${ss.event} ${
                                event.professor === -1 ? ss.activity : ss.class
                            }`}
                            style={eventStyle}
                            >
                            <div className={ss['event-title']}>{event.title}</div>
                            <div className={ss['event-time']}>
                                {event.startTime} - {event.endTime}
                            </div>
                            {event.professor !== -1 && (
                                <div className={ss['event-professor']}>
                                {event.professor}
                                </div>
                            )}
                            </div>
                        );
                        })}
                    </div>
                ))}
                </div>
            </div>
        </div>
    </div>
  );
};

export default Scheduler;