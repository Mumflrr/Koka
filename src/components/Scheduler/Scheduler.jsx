import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import "../../App.css";
import "ldrs/grid";
import Sidebar from "../Sidebar/Sidebar";
import ss from "./Scheduler.module.css";

function TimeBlock({ event, styles, overlappingEvents }) {
    const calculatePosition = () => {
        const calendar = document.querySelector(`.${ss["calendar-container"]}`);
        if (!calendar) return { top: 0, left: 0, height: 0, width: 0 };
        
        const startHour = convertTimeToDecimal(event.startTime);
        const endHour = convertTimeToDecimal(event.endTime);

        const headerHeight = calendar.querySelector(`.${ss["calendar-header-container"]}`)?.offsetHeight || 0;
        const timeColumnWidth = calendar.querySelector(`.${ss["calendar-time-slot"]}`)?.offsetWidth || 0;

        const cellHeight = calendar.querySelector(`.${ss["calendar-cell"]}`)?.offsetHeight || 0;
        const cellWidth = calendar.querySelector(`.${ss["calendar-cell"]}`)?.offsetWidth || 0;

        // Calculate position and dimensions
        const top = headerHeight + (startHour - 7) * cellHeight;
        const baseLeft = event.day * cellWidth + timeColumnWidth;
        
        // Calculate width based on overlapping events
        const eventCount = overlappingEvents.length;
        const eventIndex = overlappingEvents.findIndex(e => 
            e.startTime === event.startTime && e.title === event.title
        );
        const width = cellWidth / eventCount;
        const left = baseLeft + (width * eventIndex);
        
        const height = (endHour - startHour) * cellHeight;

        return { top, left, height, width };
    };

    const { top, left, height, width } = calculatePosition();

    return (
        <div 
            className={`${styles["event-block"]} ${overlappingEvents.length > 1 ? styles["overlapping"] : ""}`}
            style={{
                position: 'absolute',
                top: `${top}px`,
                left: `${left}px`,
                height: `${height}px`,
                width: `${width}px`,
                backgroundColor: event.color || '#3498db',
                zIndex: 3,
                color: 'white',
                fontSize: '0.8rem',
                padding: '4px',
                borderRadius: '4px',
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
            }}
            title={`${event.title}\n${event.startTime} - ${event.endTime}`}
        >
            <div className={styles["event-title"]}>{event.title}</div>
            <div className={styles["event-time"]}>
                {event.startTime} - {event.endTime}
            </div>
        </div>
    );
}

function convertTimeToDecimal(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours + (minutes / 60);
}

function findOverlappingEvents(event, allEvents) {
    return allEvents.filter(otherEvent => {
        if (event === otherEvent) return false;
        if (event.day !== otherEvent.day) return false;
        
        const eventStart = convertTimeToDecimal(event.startTime);
        const eventEnd = convertTimeToDecimal(event.endTime);
        const otherStart = convertTimeToDecimal(otherEvent.startTime);
        const otherEnd = convertTimeToDecimal(otherEvent.endTime);
        
        return (eventStart < otherEnd && eventEnd > otherStart);
    });
}

function groupOverlappingEvents(events) {
    const groups = [];
    const sortedEvents = [...events].sort((a, b) => {
        const dayCompare = a.day - b.day;
        if (dayCompare !== 0) return dayCompare;
        return convertTimeToDecimal(a.startTime) - convertTimeToDecimal(b.startTime);
    });

    sortedEvents.forEach(event => {
        const overlapping = findOverlappingEvents(event, sortedEvents);
        if (overlapping.length > 0) {
            const group = [event, ...overlapping];
            // Only add the group if it's not already included
            if (!groups.some(g => g.includes(event))) {
                groups.push(group);
            }
        } else {
            groups.push([event]);
        }
    });

    return groups;
}


function Scheduler() {
    const [loadActivitiesResult, setLoadActivitiesStatus] = useState("");
    const [activities, setActivities] = useState([]);
    const [classes, setClasses] = useState([]);
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const timeSlots = Array.from({ length: 13 }, (_, i) => `${8 + i}:00`);

    useEffect(() => {
        const unsubscribe = listen("scrape_result", (event) => {
            const result = event.payload;
            if (result === null) {
                setScrapeStatus("Scrape completed successfully!");
            } else {
                setScrapeStatus(`Error during scrape: ${result}`);
            }
            setIsScraping(false);
        });
    
        return () => {
            loadActivities();
            unsubscribe.then(f => f());
        };
    }, []);

    const Class = ({name, time, dates, professor, description}) => {
        return {
            name: name,
            time: time,
            date: dates,
            professor: professor,
            description: description
        }
    }

    const Activity = (startTime, endTime, day, title) => {
        return {
            startTime,
            endTime,
            day,
            title
        }
    }

    async function startScrape() {
        setScrapeStatus("Scraping in progress...");
        try {
        await invoke("scheduler_scrape");
        } catch (error) {
        setScrapeStatus(`Error starting scrape: ${error}`);
        }
    }

    async function loadActivities() {
        // Create a simple activity object and put it in an array
        setActivities([{
            startTime: "9:15",
            endTime: "13:00",
            day: 2,
            title: "TEST"
        }]);

        setActivities(prevActivities => [...prevActivities, {
            startTime: "13:00",
            endTime: "14:00",
            day: 2,
            title: "TEST1"
        }, {
            startTime: "13:59",
            endTime: "15:00",
            day: 2,
            title: "TEST2"
        }]);
        
        setLoadActivitiesStatus("Loading activities...");
        try {
            await invoke("loadActivities");
        } catch (error) {
            setLoadActivitiesStatus(`Error loading activities: ${error}`);
        }
    }


    async function openActivity(time, dayIndex) {
    
    }

    async function saveActivity() {
          
    }

    async function removeAcitivites() {
        
    }

    // First, let's make checkEvent synchronous since we're just filtering arrays
    function checkEvent(time, dayIndex) {
        // Check both activities and classes arrays for events at this time slot
        const matchingActivities = activities.filter(activity => {
            return activity.day === dayIndex && 
                activity.startTime <= time && 
                activity.endTime > time;
        });

        const matchingClasses = classes.filter(classItem => {
            return classItem.day === dayIndex && 
                classItem.startTime <= time && 
                classItem.endTime > time;
        });

        // Return the combined array of matching events
        return [...matchingActivities, ...matchingClasses];
    }

    return (
        <div>
            <Sidebar />
            <div className={ss["scheduler"]}>
                <div className={ss["calendar-container"]}>
                    {/* Calendar headers */}
                    <div className={ss["calendar-header-container"]}></div>
                    {days.map((day) => (
                        <div key={day} className={ss["calendar-header-container"]}>
                            <p>{day}</p>
                        </div>
                    ))}
                    
                    {/* Time slots and cells */}
                    {timeSlots.map((time, index) => (
                        <React.Fragment key={index}>
                            <div className={`${ss["calendar-time-slot"]} ${index === 0 ? ss["first-time-slot"] : ""}`}>
                                <p className={ss["time-text"]}>{time}</p>
                            </div>
                            {days.map((_, dayIndex) => (
                                <div
                                    key={`${time}-${dayIndex}`}
                                    className={ss["calendar-cell"]}
                                    onClick={() => openActivity(time, dayIndex)}
                                />
                            ))}
                        </React.Fragment>
                    ))}
                    
                    {/* Render event blocks with proper overlap handling */}
                    {groupOverlappingEvents([...activities, ...classes]).map((group, groupIndex) => 
                        group.map((event, eventIndex) => (
                            <TimeBlock 
                                key={`${groupIndex}-${eventIndex}`}
                                event={event}
                                styles={ss}
                                overlappingEvents={group}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

export default Scheduler;


                {/*
                <l-grid
                    size="100"
                    speed="1.5"
                    color="black" 
                ></l-grid>
                
                */}