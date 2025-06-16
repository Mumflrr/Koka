// src/components/Scheduler/Scheduler.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {Trash2} from 'lucide-react';
import { invoke } from "@tauri-apps/api/tauri";
import processEvents from '../CalendarGrid/processEvents';
import CalendarGrid from '../CalendarGrid/CalendarGrid';
import Sidebar from "../Sidebar/Sidebar";
import ss from './Scheduler.module.css';

// ... other imports and constants ...

const stringifySchedule = (schedule) => {
    try {
        return JSON.stringify(schedule);
    } catch (e)        {
        console.error("Failed to stringify schedule:", schedule, e);
        return null; 
    }
};

// Helper function to format integer time (e.g., 1145) to "HH:mm" string
// Used for displaying class schedule times if needed directly, though processEvents handles it for grid
const formatTimeIntToString = (timeInt) => {
    if (timeInt === null || timeInt === undefined || timeInt === -1) {
        return '00:00'; 
    }
    const timeStr = String(timeInt).padStart(4, '0');
    return `${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}`;
};

// Helper to convert day bitmask to boolean array [Mon, Tue, Wed, Thu, Fri]
// Assumes day bit 1 for Sunday, 2 for Monday, 4 for Tuesday, etc.
// UI dayIndex 0 (Mon) corresponds to bit (1 << (0+1)) = 2
// UI dayIndex 1 (Tue) corresponds to bit (1 << (1+1)) = 4
const bitmaskToDayArray = (dayBitmask) => {
    const dayArray = [false, false, false, false, false]; // Mon, Tue, Wed, Thu, Fri
    for (let i = 0; i < 5; i++) { // i = 0 for Monday, 1 for Tuesday, ...
        if ((dayBitmask & (1 << (i + 1))) !== 0) { // (1<<(i+1)) gives Mon=2, Tue=4, ...
            dayArray[i] = true;
        }
    }
    return dayArray;
};


const Scheduler = () => {
    // userEvents will store events with startTime/endTime as HHmm integers
    const [userEvents, setUserEvents] = useState([]); 
    const [currentHoveredSchedule, setCurrentHoveredSchedule] = useState(null);
    const [schedules, setSchedules] = useState([]);
    const [selectedScheduleIndex, setSelectedScheduleIndex] = useState(null); // For pinned schedule
    const [detailsEvent, setDetailsEvent] = useState(null); // For read-only modal
    // ... other state variables ...
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [renderFavorites, setRenderFavorites] = useState(false);
    const [seed, setSeed] = useState(1);
    const [classes, setClasses] = useState([]);

    const schedulesStringArray = useMemo(() => {
        return schedules.map(stringifySchedule).filter(s => s !== null);
    }, [schedules]); 

    const [favoritedSchedules, setFavoritedSchedules] = useState([]); 
    const favoritedScheduleStrings = useMemo(() => {
        return new Set(favoritedSchedules.map(stringifySchedule).filter(s => s !== null));
    }, [favoritedSchedules]); 

    const [scrapeState, setScrapeState] = useState({
        isScraping: false,
        status: "",
    });
    const { isScraping, status: scrapeStatus } = scrapeState;
    const [paramCheckboxes, setParamCheckboxes] = useState({
        box1: false,
        box2: false,
    });

    useEffect(() => {
        loadPage();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


    const { eventsByDay, noTimeEventsByDay } = useMemo(() => {
        // A hovered schedule takes precedence, otherwise show the selected/pinned one
        const scheduleToDisplay = currentHoveredSchedule ?? (selectedScheduleIndex !== null && schedules && schedules[selectedScheduleIndex] ? schedules[selectedScheduleIndex] : null);

        let combinedRawEvents = userEvents.map(event => ({
            ...event,
            startTime: event.startTime,
            endTime: event.endTime,
            isPreview: false,
        }));

        if (scheduleToDisplay && Array.isArray(scheduleToDisplay)) {
            const previewEvents = scheduleToDisplay.flatMap((courseData, courseIndex) => {
                if (!courseData || !courseData.classes || !Array.isArray(courseData.classes)) {
                    return [];
                }

                return courseData.classes.map((classMeeting, meetingIndex) => {
                    if (!classMeeting || !classMeeting.days || !Array.isArray(classMeeting.days)) {
                        return null;
                    }

                    let dayBitmask = 0;
                    let meetingStartTimeInt = null;
                    let meetingEndTimeInt = null;
                    let hasAnyActiveDay = false;

                    classMeeting.days.forEach((dayInfo, dayUiIndex) => {
                        if (!Array.isArray(dayInfo) || dayInfo.length < 2 ||
                            !Array.isArray(dayInfo[0]) || dayInfo[0].length < 2) {
                            return;
                        }
                        const timePair = dayInfo[0];
                        const isActive = dayInfo[1];

                        if (isActive && timePair[0] !== -1) {
                            dayBitmask |= (1 << (dayUiIndex + 1));
                            if (meetingStartTimeInt === null) {
                                meetingStartTimeInt = timePair[0];
                                meetingEndTimeInt = timePair[1];
                            }
                            hasAnyActiveDay = true;
                        }
                    });

                    const courseIdPart = courseData.id || `${courseData.code || 'course'}${courseData.name || courseIndex}`;
                    const meetingIdPart = classMeeting.section || meetingIndex;
                    const eventId = `preview-${courseIdPart}-${meetingIdPart}`;
                    const title = `${courseData.code || ''} ${courseData.name || ''}`.trim() +
                        (classMeeting.section ? ` - Sec ${classMeeting.section}` : '');

                    // If there are no active days, create a "no time" event for all days (Mon-Fri)
                    if (!hasAnyActiveDay) {
                        // Create one event for each day (Mon-Fri)
                        return [0, 1, 2, 3, 4].map(dayUiIndex => ({
                            id: `${eventId}-notime-${dayUiIndex}`,
                            isPreview: true,
                            title: title,
                            professor: classMeeting.instructor || '',
                            description: courseData.description || '',
                            startTime: 0, // or -1
                            endTime: 0,   // or -1
                            day: 1 << (dayUiIndex + 1), // Only this day
                        }));
                    }

                    // Otherwise, normal event
                    if (dayBitmask === 0 || meetingStartTimeInt === null) {
                        return null;
                    }

                    return {
                        id: eventId,
                        isPreview: true,
                        title: title,
                        professor: classMeeting.instructor || '',
                        description: courseData.description || '',
                        startTime: meetingStartTimeInt,
                        endTime: meetingEndTimeInt,
                        day: dayBitmask,
                    };
                }).flat().filter(event => event !== null);
            });
            combinedRawEvents = [...combinedRawEvents, ...previewEvents];
        }

        return processEvents(combinedRawEvents);
    }, [userEvents, currentHoveredSchedule, selectedScheduleIndex, schedules]);

    const loadPage = async() => {
        try {
            setLoading(true);
            setError(null);

            await updateSchedulePage(); // await the async function
            const loadedSelected = await invoke('get_display_schedule');
            setSelectedScheduleIndex(loadedSelected);

            const loadedClasses = await invoke('get_classes');
            console.log(loadedClasses);
            setClasses(loadedClasses);

       } catch (err) {
            console.error('Error loading page data:', err);
            setError('Failed to load schedule data. Please try again later.');
            setUserEvents([]); 
            setSchedules([[]]);
            setFavoritedSchedules([]);
        } finally {
            setLoading(false);
        }
    }

    const updateSchedulePage = async() => {
        try {
            // Loaded events will have startTime/endTime as HHmm integers from backend
            const loadedEvents = await invoke('get_events', {table: "scheduler"});
            setUserEvents(loadedEvents || []); 

            let loadedSchedules = await invoke('get_schedules', {table: "combinations"});
            if (Array.isArray(loadedSchedules) && loadedSchedules.length > 0) {
                setSchedules(loadedSchedules);
            } else {
                setSchedules([[]]); 
            }

            loadedSchedules = await invoke('get_schedules', {table: "favorites"});
            if (Array.isArray(loadedSchedules) && loadedSchedules.length > 0) {
                setFavoritedSchedules(loadedSchedules);
            } else {
                setFavoritedSchedules([]); 
            }

        } catch (err) {
            console.error('Error in updateSchedulePage:', err);
            throw err; 
        }
    }

    // ... renderScrollbar, ClassCard, AddClassCard etc. should not need changes for time format ...
    // ... as they don't directly manipulate event times in the HHmm format ...
    const renderScrollbar = () => {
        const schedulesToRender = renderFavorites ? favoritedSchedules : schedules;
        const isEmpty = !schedulesToRender.length || (schedulesToRender.length === 1 && !schedulesToRender[0]?.length);

        if (isEmpty) {
            const message = renderFavorites
                ? "No favorited schedules."
                : "No schedules generated yet.";
            return (
                <div className={ss['scrollbar-wrapper']}>
                    <div className={ss['empty-message']}>{message}</div>
                </div>
            );
        }

        return (
            <div className={ss['scrollbar-wrapper']} key={seed}>
                {schedulesToRender.map((schedule, i) => {
                    const currentScheduleString = stringifySchedule(schedule);
                    const isFavorite = currentScheduleString !== null && favoritedScheduleStrings.has(currentScheduleString);
                    const displayIndex = schedulesStringArray.indexOf(currentScheduleString);
                    const displayNum = displayIndex !== -1 ? displayIndex + 1 : "?";
                    const isSelected = displayIndex !== -1 && displayIndex === selectedScheduleIndex;

                    return (
                        <div
                            key={currentScheduleString} 
                            className={`${ss['item-slot']} ${isSelected ? ss['selected-schedule'] : ''}`}
                            onClick={() => scheduleMenuClick(schedule, displayIndex)} 
                            onMouseEnter={() => scheduleMenuHover(schedule)} 
                            onMouseLeave={handleScheduleMenuLeave} 
                        >
                            <button
                                className={`${ss['favorite-button']} ${isFavorite ? ss['favorited'] : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    changeFavoriteStatus(schedule, currentScheduleString, isFavorite);
                                }}
                                aria-label={`${isFavorite ? 'Unfavorite' : 'Favorite'} Schedule ${displayNum}`}
                            >
                                {isFavorite ? '★' : '☆'}
                            </button>
                            <p>Schedule {displayNum}</p>
                            <button
                                className={ss['delete-button']}
                                onClick={(e) => {
                                    e.stopPropagation(); 
                                    deleteSchedule(currentScheduleString, isFavorite);
                                }}
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    );
                })}
            </div>
        );
    };
    const ClassCard = ({ classData, onUpdate, onDelete }) => {
        const [displayedCourseCode, setDisplayedCourseCode] = useState(`${classData.code}${classData.name}`);
        const [formData, setFormData] = useState({
            id: classData.id,
            code: classData.code || '',
            name: classData.name || '',
            section: classData.section || '',
            instructor: classData.instructor || '',
            courseCodeValid: true,
            sectionCodeValid: true
        });
        const [modified, setModified] = useState({
            code: false,
            section: false,
            instructor: false,
        });

        useEffect(() => {
            setFormData({
                id: classData.id,
                code: classData.code || '',
                name: classData.name || '',
                section: classData.section || '',
                instructor: classData.instructor || ''
            });
            setDisplayedCourseCode(
                (classData.code && classData.name) ? `${classData.code}${classData.name}` : (classData.code || '')
            );
        }, [classData]);

        const handleDelete = () => {
            onDelete(classData.id);
        };

        const handleChange = (e) => {
            const { name, value } = e.target;
            if (name === 'code') {
                setDisplayedCourseCode(value);
                const cleanedValue = value.replace(/\s+/g, '').toUpperCase();
                const courseCodeRegex = /^([A-Z]{1,3})(\d{3})$/;
                const match = cleanedValue.match(courseCodeRegex);
                if (match) {
                    setFormData(prev => ({
                        ...prev,
                        code: match ? match[1] : '', 
                        name: match ? match[2] : '', 
                        courseCodeValid: true
                    }));
                } else {
                    setFormData(prev => ({ ...prev, courseCodeValid: false }));
                }
            }
            else if (name === 'section') {
                const cleanedValue = value.replace(/\s+/g, '');
                const sectionRegex = /^\d{3}([A-Z])?$/;
                const isValid = sectionRegex.test(cleanedValue) || value === '' || !value;
                setFormData(prev => ({
                    ...prev,
                    [name]: value,
                    sectionCodeValid: isValid
                }));
            } else {
                setFormData(prev => ({ ...prev, [name]: value }));
            }
            setModified(prev => ({ ...prev, [name]: true }));
        };

        const handleBlur = async (e) => {
            const { name } = e.target;
            if (modified[name]) {
                if (!formData.courseCodeValid && name === 'code') {
                    console.error("Valid course code required (e.g., CSC116)");
                    return; 
                }
                if (!formData.sectionCodeValid && name === 'section') {
                    console.error("Valid section required (3 digits with optional letter)");
                    return; 
                }
                onUpdate(formData);
                setModified(prev => ({ ...prev, [name]: false }));
            }
        };

        return (
          <div className={ss.classCard}>
            <form>
              <div className={ss.cardHeader}>
                <div className={ss.classTitle}>
                <input
                    type="text" name="code" value={displayedCourseCode}
                    onChange={handleChange} onBlur={handleBlur}
                    className={ss.inputField} placeholder="Course (ex. CSC116)" />
                  <span> | Section: </span>
                  <input
                    type="text" name="section" value={formData.section}
                    onChange={handleChange} onBlur={handleBlur}
                    className={ss.inputField} placeholder="Section (ex. 001 or 001A)" />
                </div>
                <div className={ss.menuActions}>
                    <button type="button" className={ss.deleteButton} onClick={handleDelete} >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" /> <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1-2-2h4a2 2 0 0 1-2 2v2" /> <line x1="10" y1="11" x2="10" y2="17" /> <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                    </button>
                </div>
                <button type="button" className={ss.menuButton}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="1" /> <circle cx="19" cy="12" r="1" /> <circle cx="5" cy="12" r="1" />
                  </svg>
                </button>
              </div>
              <div className={ss.classInfo}>
                <p>001: Days + Time</p> {classData.name === "116" && <p className={ss.location}>Location</p>}
                <div className={ss.instructorWrapper}>
                  <div className={ss.avatarCircle}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /> <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <input
                    type="text" name="instructor" value={formData.instructor}
                    onChange={handleChange} onBlur={handleBlur}
                    className={ss.inputField} placeholder="Professor Name" />
                </div>
              </div>
            </form>
          </div>
        );
    };
    const AddClassCard = ({ onClick }) => {
      return (
        <div className={ss.addClassCard} onClick={onClick}>
          <button className={ss.addButtonCard}>
            <div className={ss.addIconCircle}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /> <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <span>Add Class</span>
          </button>
        </div>
      );
    };
    const handleUpdateClass = async (classData) => {
        try {
            await invoke('update_classes', {class: classData});
            setClasses(prev => prev.map(item => item.id === classData.id ? { ...classData} : item));
        } catch (err) {
            console.error("Error updating class:", err);
        }
    };
    const handleDeleteClass = async (id) => {
        try {
            await invoke('remove_class', { id: id });
            setClasses(prev => prev.filter(item => item.id !== id));
        } catch (err) {
            console.error("Error deleting class:", err);
        }
    };
    const handleAddClass = () => {
        const newClass = {
            id: Date.now().toString(), code: '', name: '', section: '', instructor: ''
        };
        setClasses(prev => [...prev, newClass]);
    };
    const renderClasses = () => {
        return (
            <div className={ss.container}>
                <div className={ss.classesWrapper}>
                    {classes.map((classItem) => (
                        <ClassCard
                            key={classItem.id} classData={classItem}
                            onUpdate={handleUpdateClass} onDelete={handleDeleteClass} />
                    ))}
                    <AddClassCard onClick={handleAddClass} />
                </div>
            </div>
        );
    };


    // newEvent will have startTime/endTime as HHmm integers from CalendarGrid's handleSaveEvent
    const handleCreateEvent = async (newEventWithIntTimes) => { 
        try {
            // Ensure a unique ID if not already set (though CalendarGrid should handle this)
            const eventToSave = { ...newEventWithIntTimes, id: newEventWithIntTimes.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}` };
            await invoke('create_event', { event: eventToSave, table: "scheduler" });
            // Add to userEvents state, keeping times as integers
            setUserEvents(prevEvents => [...prevEvents, eventToSave]); 
        } catch (err) {
            console.error('Error saving event:', err);
            setError('Failed to save event. Please try again.');
        }
    };

    const handleDeleteEvent = async (eventId) => { 
        const originalUserEvents = [...userEvents]; 
        setUserEvents(prevEvents => prevEvents.filter(e => e.id !== eventId)); 
        try {
            await invoke('delete_event', { eventId, table: "scheduler" });
        } catch (err) {
            console.error('Error deleting event:', err);
            setError('Failed to delete event. Please try again.');
            setUserEvents(originalUserEvents); 
        }
    };

    // updatedEvent will have startTime/endTime as HHmm integers
    const handleUpdateEvent = async (updatedEventWithIntTimes) => { 
        const originalUserEvents = [...userEvents]; 
        setUserEvents(prevEvents => 
            prevEvents.map(e => e.id === updatedEventWithIntTimes.id ? updatedEventWithIntTimes : e)
        );
        try {
            // Assuming 'update_event' command exists and works like 'create_event'
            await invoke('update_event', { event: updatedEventWithIntTimes, table: "scheduler" }); 
        } catch (err) {
            console.error('Error updating event:', err);
            setError('Failed to update event. Please try again.');
            setUserEvents(originalUserEvents); 
        }
    };

    const generateSchedules = async () => {
        setScrapeState({ isScraping: true, status: "Starting scrape..." });

        try {
             // userEvents have startTime/endTime as HHmm integers
             const formattedUserEventsForScrape = userEvents.map(event => ({
                 time: [event.startTime, event.endTime], // These are HHmm integers
                 days: bitmaskToDayArray(event.day)      // Convert bitmask to [bool; 5]
             }));

             const result = await invoke("generate_schedules", {
                parameters: {
                    params_checkbox: [
                        paramCheckboxes.box1,
                        paramCheckboxes.box2,
                        false 
                    ],
                    classes: classes, // classes from state
                    events: formattedUserEventsForScrape // Pass correctly formatted events
                }
            });

            // ... (rest of generateSchedules logic for handling result) ...
            if (typeof result === 'string') {
                console.error("Scrape error:", result);
                setScrapeState({ isScraping: false, status: `Error: ${result}` });
                setSchedules([[]]);
                setFavoritedSchedules([]); 
            } else if (Array.isArray(result)) {
                console.log("Scrape successful:", result);
                const numSchedules = result.length;
                setScrapeState({
                    isScraping: false,
                    status: numSchedules > 0 ? `Scrape completed, found ${numSchedules} schedules.` : "Scrape completed. No matching schedules found."
                });
                 setSchedules(numSchedules > 0 && result[0].length > 0 ? result : [[]]);
                setFavoritedSchedules([]);
                await updateSchedulePage(); 
                setSeed(Math.random()); 
            } else {
                 console.error("Scrape returned unexpected data:", result);
                 setScrapeState({ isScraping: false, status: `Error: Received unexpected data from backend.` });
                 setSchedules([[]]);
                 setFavoritedSchedules([]);
            }
        } catch (error) {
            console.error("Scrape invocation failed:", error);
            const errorMessage = error.message || (typeof error === 'string' ? error : 'Unknown error');
            setError(`Unable to scrape: ${errorMessage}`);
            setScrapeState({ isScraping: false, status: `Scrape failed: ${errorMessage}` });
            setSchedules([[]]);
            setFavoritedSchedules([]);
        }
    };
    
    const changeFavoriteStatus = async (scheduleData, scheduleString, isCurrentlyFavorite) => {
        try {
            setCurrentHoveredSchedule(null);
            
            await invoke("change_favorite_schedule", {
                id: scheduleString, 
                isFavorited: isCurrentlyFavorite,
                schedule: scheduleData
            });
            await updateSchedulePage(); 
            setSeed(Math.random()); 

        } catch (error) {
            console.error("Failed to update favorite status:", error);
            setError(`Failed to update favorite status for schedule.`);
        }
    }

    const deleteSchedule = async (id, isCurrentlyFavorite) => {
        try {
            setCurrentHoveredSchedule(null);

            await invoke("delete_schedule", {
                id: id, 
                isFavorited: isCurrentlyFavorite
            });
            await updateSchedulePage(); 
            setSeed(Math.random()); 
        } catch (error) {
            console.error("Failed to delete schedule:", error);
            setError(`Failed to delete schedule.`);
        }
    }

    const scheduleMenuClick = async (scheduleData, scheduleIndex) => {
        if (scheduleIndex === -1) {
            return; // Cannot select a schedule not in the current list (e.g., a favorite from a previous generation)
        }
    
        // If clicking the same schedule, unpin it (set to null). Otherwise, pin the new one.
        const newSelectedScheduleIndex = selectedScheduleIndex === scheduleIndex ? null : scheduleIndex;
    
        try {
            await invoke('set_display_schedule', { id: newSelectedScheduleIndex });
            setSelectedScheduleIndex(newSelectedScheduleIndex);
            // After a click, we want the hover effect to go away to see the pinned schedule.
            setCurrentHoveredSchedule(null);
        } catch (error) {
            console.error("Failed to set display schedule:", error);
            setError("Failed to pin schedule.");
        }
    };
    
    const scheduleMenuHover = (scheduleData) => {
        // console.log("Hovered schedule:", scheduleData);
        setCurrentHoveredSchedule(scheduleData);
    }

    const handleScheduleMenuLeave = () => {
        setCurrentHoveredSchedule(null);
    }

    const toggleParamCheckbox = (boxName) => {
        setParamCheckboxes(prev => ({
            ...prev,
            [boxName]: !prev[boxName]
        }));
    };

    const handleShowDetails = (event) => {
        setDetailsEvent(event);
    };

    const handleCloseDetails = () => {
        setDetailsEvent(null);
    };

    if (error) {
         return (
            <div className={ss['scheduler']}>
                <Sidebar />
                <div className={ss['message-container']}>
                    <div className={ss['message']}>{error}</div>
                    <button
                        className={`${ss.button} ${ss['button-primary']}`}
                        onClick={loadPage}
                    >
                        Retry Load
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={ss['scheduler']}>
            <Sidebar />

            <div className={ss['scheduler-wrapper']}>
                <CalendarGrid
                    events={eventsByDay}
                    noTimeEvents={noTimeEventsByDay}
                    onEventCreate={handleCreateEvent}
                    onEventDelete={handleDeleteEvent}
                    onEventUpdate={handleUpdateEvent}
                    onShowDetails={handleShowDetails}
                    detailsEvent={detailsEvent}
                    onCloseDetails={handleCloseDetails}
                />
                {renderScrollbar()}
            </div>

            <div className={ss['scrape-container']}>
                <button
                    className={`${ss.button} ${ss['button-primary']}`}
                    onClick={generateSchedules}
                    disabled={isScraping}
                >
                    {isScraping ? "Scraping..." : "Generate Schedules"}
                </button>

                {scrapeStatus && (
                    <div className={`${ss['status-message']} ${
                        scrapeStatus.includes("Error") || scrapeStatus.includes("failed") ? ss['status-error'] : ss['status-success']
                    }`}>
                        {scrapeStatus}
                    </div>
                )}

                <button onClick={() => {
                    setCurrentHoveredSchedule(null);
                    setRenderFavorites(!renderFavorites)
                }}>
                    {renderFavorites ? "Show Generated" : "Show Favorites"}
                </button>
                <button onClick={() => toggleParamCheckbox('box1')}>
                    Scrape open sections only {paramCheckboxes.box1 ? '✓' : ''}
                </button>
                <button onClick={() => toggleParamCheckbox('box2')}>
                    Waitlist ok? {paramCheckboxes.box2 ? '✓' : ''}
                </button>

                {isScraping && (
                    <div className={ss['loading-indicator']}>
                        <div className={ss['spinner']}></div>
                        <p>Scraping in progress. This may take a minute or two. Please don't close this window.</p>
                    </div>
                )}

                {renderClasses()}
            </div>
        </div>
    );
};

export default Scheduler;