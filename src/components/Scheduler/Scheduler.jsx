import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import "../../App.css";
import "ldrs/grid";
import Sidebar from "../Sidebar/Sidebar";
import ss from "./Scheduler.module.css";

function TimeBlock({ event, overlappingEvents }) {
    const calculatePosition = () => {
        const calendar = document.querySelector(`.${ss["calendar-container"]}`);
        if (!calendar) return { top: 0, left: 0, height: 0, width: 0 };
        
        // Get header height and time column width
        const headerHeight = calendar.querySelector(`.${ss["calendar-header-container"]}`)?.offsetHeight || 0;
        const timeColumnWidth = calendar.querySelector(`.${ss["calendar-time-slot"]}`)?.offsetWidth || 0;
        
        // Calculate cell dimensions
        const totalHeight = calendar.clientHeight - headerHeight;
        const cellHeight = totalHeight / 13; // 13 time slots
        const availableWidth = calendar.clientWidth - timeColumnWidth;
        const cellWidth = availableWidth / 5; // 5 days
        
        // Convert times to decimal hours (e.g., 9:30 -> 9.5)
        const startHour = convertTimeToDecimal(event.startTime);
        const endHour = convertTimeToDecimal(event.endTime);
        
        // Calculate vertical position (accounting for 8:00 start time)
        const startOffset = startHour - 8; // Offset from 8:00
        const duration = endHour - startHour;
        
        // Calculate positions
        const top = headerHeight + (startOffset * cellHeight);
        const height = duration * cellHeight;
        
        // Handle overlapping events
        const eventCount = overlappingEvents.length;
        const eventIndex = overlappingEvents.findIndex(e => 
            e.startTime === event.startTime && e.title === event.title
        );
        
        // Calculate width and horizontal position
        const width = -1 + cellWidth / eventCount;
        const left = timeColumnWidth + (event.day * cellWidth) + (width * eventIndex);
        
        return {
            top,
            left,
            height,
            width,
        };
    };

    // Store the calculation function in a ref
    const positionRef = React.useRef(calculatePosition);
    
    // State for current position
    const [position, setPosition] = React.useState(calculatePosition());

    // Update position on window resize
    React.useEffect(() => {
        const calendar = document.querySelector(`.${ss["calendar-container"]}`);
        if (!calendar) return;

        const updatePosition = () => {
            setPosition(positionRef.current());
        };

        const observer = new ResizeObserver(updatePosition);
        observer.observe(calendar);

        // Initial position calculation
        updatePosition();

        return () => observer.disconnect();
    }, []);

    return (
        <div 
            className={`${ss["event-block"]} ${overlappingEvents.length > 1 ? ss["overlapping"] : ""} ${event.professor == -1 ? ss["activity"] : ss["class"]}`}
            style={{
                position: 'absolute',
                top: `${position.top}px`,
                left: `${position.left}px`,
                height: `${position.height}px`,
                width: `${position.width}px`,
            }}
            title={`${event.title}\n${event.startTime} - ${event.endTime}`}
        >
            <div className={ss["event-title"]}>{event.title}</div>
            <div className={ss["event-time"]}>
                {event.startTime} - {event.endTime}
            </div>
            {event.professor !== -1 && (
                <div className={ss["event-professor"]}>{event.professor}</div>
            )}
            {event.description !== -1 && (
                <div className={ss["event-description"]}>{event.description}</div>
            )}
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
    const [loadEventsResult, setLoadEventsStatus] = useState("");
    const [events, setEvents] = useState([]);
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
            loadEvents();
            unsubscribe.then(f => f());
        };
    }, []);

    const Event = ({name, startTime, endTime, days, professor, description}) => {
        return {
            name,
            startTime,
            endTime,
            days,
            professor,
            description,
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

    async function loadEvents() {
        // Create a simple Event object and put it in an array
        setEvents([{
            startTime: "9:15",
            endTime: "13:00",
            day: 2,
            title: "TEST",
            professor: -1,
            description: -1
        }]);

        setEvents(prevEvents => [...prevEvents, {
            startTime: "13:00",
            endTime: "14:00",
            day: 2,
            title: "TEST1",
            professor: -1,
            description: -1
        }, {
            startTime: "13:59",
            endTime: "15:00",
            day: 2,
            title: "TEST2",
            professor: "Albemarle",
            description: -1
        }]);
        
        setLoadEventsStatus("Loading events...");
        try {
            await invoke("loadEvents");
        } catch (error) {
            setLoadEventsStatus(`Error loading events: ${error}`);
        }
    }


    async function openEvent(time, dayIndex) {
    
    }

    async function saveEvent() {
          
    }

    async function removeAcitivites() {
        
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
                                    onClick={() => openEvent(time, dayIndex)}
                                />
                            ))}
                        </React.Fragment>
                    ))}
                    
                    {/* Render event blocks */}
                    {groupOverlappingEvents([...events, ...classes]).map((group, groupIndex) => 
                        group.map((event, eventIndex) => (
                            <TimeBlock 
                                key={`${groupIndex}-${eventIndex}`}
                                event={event}
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