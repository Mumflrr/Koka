// src/components/Scheduler/Scheduler.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {Trash2, Plus} from 'lucide-react'; // Added Plus icon
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

const formatTimeIntToString = (timeInt) => {
    if (timeInt === null || timeInt === undefined || timeInt === -1) {
        return '00:00'; 
    }
    const timeStr = String(timeInt).padStart(4, '0');
    return `${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}`;
};

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
    const [userEvents, setUserEvents] = useState([]); 
    const [currentHoveredSchedule, setCurrentHoveredSchedule] = useState(null);
    const [schedules, setSchedules] = useState([]);
    const [selectedScheduleIndex, setSelectedScheduleIndex] = useState(null);
    const [detailsEvent, setDetailsEvent] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [renderFavorites, setRenderFavorites] = useState(false);
    const [seed, setSeed] = useState(1);
    const [classes, setClasses] = useState([]);
    const [favoritedSchedules, setFavoritedSchedules] = useState([]); 
    const [activeTab, setActiveTab] = useState('schedules');

    const schedulesStringArray = useMemo(() => {
        return schedules.map(stringifySchedule).filter(s => s !== null);
    }, [schedules]); 

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
        const scheduleToDisplay = currentHoveredSchedule ?? (selectedScheduleIndex !== null && schedules && schedules[selectedScheduleIndex] ? schedules[selectedScheduleIndex] : null);
        let combinedRawEvents = userEvents.map(event => ({ ...event, startTime: event.startTime, endTime: event.endTime, isPreview: false, }));
        if (scheduleToDisplay && Array.isArray(scheduleToDisplay)) {
            const previewEvents = scheduleToDisplay.flatMap((courseData, courseIndex) => {
                if (!courseData || !courseData.classes || !Array.isArray(courseData.classes)) { return []; }
                return courseData.classes.map((classMeeting, meetingIndex) => {
                    if (!classMeeting || !classMeeting.days || !Array.isArray(classMeeting.days)) { return null; }
                    let dayBitmask = 0;
                    let meetingStartTimeInt = null;
                    let meetingEndTimeInt = null;
                    let hasAnyActiveDay = false;
                    classMeeting.days.forEach((dayInfo, dayUiIndex) => {
                        if (!Array.isArray(dayInfo) || dayInfo.length < 2 || !Array.isArray(dayInfo[0]) || dayInfo[0].length < 2) { return; }
                        const timePair = dayInfo[0];
                        const isActive = dayInfo[1];
                        if (isActive && timePair[0] !== -1) {
                            dayBitmask |= (1 << (dayUiIndex + 1));
                            if (meetingStartTimeInt === null) { meetingStartTimeInt = timePair[0]; meetingEndTimeInt = timePair[1]; }
                            hasAnyActiveDay = true;
                        }
                    });
                    const courseIdPart = courseData.id || `${courseData.code || 'course'}${courseData.name || courseIndex}`;
                    const meetingIdPart = classMeeting.section || meetingIndex;
                    const eventId = `preview-${courseIdPart}-${meetingIdPart}`;
                    const title = `${courseData.code || ''} ${courseData.name || ''}`.trim() + (classMeeting.section ? ` - Sec ${classMeeting.section}` : '');
                    if (!hasAnyActiveDay) {
                        return [0, 1, 2, 3, 4].map(dayUiIndex => ({ id: `${eventId}-notime-${dayUiIndex}`, isPreview: true, title: title, professor: classMeeting.instructor || '', description: courseData.description || '', startTime: 0, endTime: 0, day: 1 << (dayUiIndex + 1), }));
                    }
                    if (dayBitmask === 0 || meetingStartTimeInt === null) { return null; }
                    return { id: eventId, isPreview: true, title: title, professor: classMeeting.instructor || '', description: courseData.description || '', startTime: meetingStartTimeInt, endTime: meetingEndTimeInt, day: dayBitmask, };
                }).flat().filter(event => event !== null);
            });
            combinedRawEvents = [...combinedRawEvents, ...previewEvents];
        }
        return processEvents(combinedRawEvents);
    }, [userEvents, currentHoveredSchedule, selectedScheduleIndex, schedules]);

    const loadPage = async () => {
        try {
            setLoading(true);
            setError(null);

            await updateSchedulePage();
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
    };

    const updateSchedulePage = async () => {
        try {
            const loadedEvents = await invoke('get_events', { table: "scheduler" });
            setUserEvents(loadedEvents || []);

            let loadedSchedules = await invoke('get_schedules', { table: "combinations" });
            if (Array.isArray(loadedSchedules) && loadedSchedules.length > 0) {
                setSchedules(loadedSchedules);
            } else {
                setSchedules([[]]);
            }

            loadedSchedules = await invoke('get_schedules', { table: "favorites" });
            if (Array.isArray(loadedSchedules) && loadedSchedules.length > 0) {
                setFavoritedSchedules(loadedSchedules);
            } else {
                setFavoritedSchedules([]);
            }
        } catch (err) {
            console.error('Error in updateSchedulePage:', err);
            throw err;
        }
    };

    const handleCreateEvent = async (newEventWithIntTimes) => {
        try {
            const eventToSave = { ...newEventWithIntTimes, id: newEventWithIntTimes.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}` };
            await invoke('create_event', { event: eventToSave, table: "scheduler" });
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

    const handleUpdateEvent = async (updatedEventWithIntTimes) => {
        const originalUserEvents = [...userEvents];
        setUserEvents(prevEvents => prevEvents.map(e => e.id === updatedEventWithIntTimes.id ? updatedEventWithIntTimes : e));
        try {
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
            const formattedUserEventsForScrape = userEvents.map(event => ({ time: [event.startTime, event.endTime], days: bitmaskToDayArray(event.day) }));
            const result = await invoke("generate_schedules", { parameters: { params_checkbox: [paramCheckboxes.box1, paramCheckboxes.box2, false], classes: classes, events: formattedUserEventsForScrape } });
            if (typeof result === 'string') {
                console.error("Scrape error:", result);
                setScrapeState({ isScraping: false, status: `Error: ${result}` });
                setSchedules([[]]);
                setFavoritedSchedules([]);
            } else if (Array.isArray(result)) {
                console.log("Scrape successful:", result);
                const numSchedules = result.length;
                setScrapeState({ isScraping: false, status: numSchedules > 0 ? `Scrape completed, found ${numSchedules} schedules.` : "Scrape completed. No matching schedules found." });
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
            if (renderFavorites) setCurrentHoveredSchedule(null);
            await invoke("change_favorite_schedule", { id: scheduleString, isFavorited: isCurrentlyFavorite, schedule: scheduleData });
            await updateSchedulePage();
            setSeed(Math.random());
        } catch (error) {
            console.error("Failed to update favorite status:", error);
            setError(`Failed to update favorite status for schedule.`);
        }
    };

    const deleteSchedule = async (id, isCurrentlyFavorite) => {
        try {
            setCurrentHoveredSchedule(null);
            await invoke("delete_schedule", { id: id, isFavorited: isCurrentlyFavorite });
            await updateSchedulePage();
            setSeed(Math.random());
        } catch (error) {
            console.error("Failed to delete schedule:", error);
            setError(`Failed to delete schedule.`);
        }
    };

    const scheduleMenuClick = async (scheduleData, scheduleIndex) => {
        if (scheduleIndex === -1) {
            return;
        }
        const newSelectedScheduleIndex = selectedScheduleIndex === scheduleIndex ? null : scheduleIndex;
        try {
            await invoke('set_display_schedule', { id: newSelectedScheduleIndex });
            setSelectedScheduleIndex(newSelectedScheduleIndex);
            setCurrentHoveredSchedule(null);
        } catch (error) {
            console.error("Failed to set display schedule:", error);
            setError("Failed to pin schedule.");
        }
    };
    
    const scheduleMenuHover = (scheduleData) => {
        setCurrentHoveredSchedule(scheduleData);
    };

    const handleScheduleMenuLeave = () => {
        setCurrentHoveredSchedule(null);
    };

    const toggleParamCheckbox = (boxName) => {
        setParamCheckboxes(prev => ({ ...prev, [boxName]: !prev[boxName] }));
    };

    const handleShowDetails = (event) => {
        setDetailsEvent(event);
    };

    const handleCloseDetails = () => {
        setDetailsEvent(null);
    };

    const handleUpdateClass = async (classData) => {
        try {
            await invoke('update_classes', { class: classData });
            setClasses(prev => prev.map(item => item.id === classData.id ? { ...classData } : item));
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
        const newClass = { id: Date.now().toString(), code: '', name: '', section: '', instructor: '' };
        setClasses(prev => [...prev, newClass]);
    };

    // ... The render functions remain the same as the previous step ...
    const renderScrollbar = () => {
        const schedulesToRender = renderFavorites ? favoritedSchedules : schedules;
        const isEmpty = !schedulesToRender.length || (schedulesToRender.length === 1 && !schedulesToRender[0]?.length);

        return (
            <div className={ss.schedulesContainer} key={seed}>
                <div className={ss.listActions}>
                    <button
                        className={`${ss.toggleButton} ${ss.button} ${renderFavorites ? ss.active : ''}`}
                        onClick={() => {
                            setCurrentHoveredSchedule(null);
                            setRenderFavorites(!renderFavorites)
                        }}>
                        {renderFavorites ? "★ Favorites" : "Show Favorites"}
                    </button>
                </div>

                {isEmpty ? (
                    <div className={ss['empty-message']}>
                        {renderFavorites ? "You have no favorited schedules." : "No schedules have been generated yet."}
                    </div>
                ) : (
                    schedulesToRender.map((schedule, i) => {
                        const currentScheduleString = stringifySchedule(schedule);
                        const isFavorite = currentScheduleString !== null && favoritedScheduleStrings.has(currentScheduleString);
                        const displayIndex = schedulesStringArray.indexOf(currentScheduleString);
                        const displayNum = displayIndex !== -1 ? displayIndex + 1 : "?";
                        const isSelected = displayIndex !== -1 && displayIndex === selectedScheduleIndex;

                        return (
                            <div
                                key={currentScheduleString} 
                                className={`${ss.scheduleItem} ${isSelected ? ss['selected-schedule'] : ''}`}
                                onClick={() => scheduleMenuClick(schedule, displayIndex)} 
                                onMouseEnter={() => scheduleMenuHover(schedule)} 
                                onMouseLeave={handleScheduleMenuLeave} 
                            >
                                <button
                                    className={`${ss['favorite-button']} ${isFavorite ? ss['favorited'] : ''}`}
                                    onClick={(e) => { e.stopPropagation(); changeFavoriteStatus(schedule, currentScheduleString, isFavorite); }}
                                    aria-label={`${isFavorite ? 'Unfavorite' : 'Favorite'} Schedule ${displayNum}`}
                                >
                                    {isFavorite ? '★' : '☆'}
                                </button>
                                <span>Schedule {displayNum}</span>
                                <button
                                    className={ss.iconButton}
                                    onClick={(e) => { e.stopPropagation(); deleteSchedule(currentScheduleString, isFavorite); }}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        );
                    })
                )}
            </div>
        );
    };

    const ClassCard = ({ classData, onUpdate, onDelete }) => {
        const [displayedCourseCode, setDisplayedCourseCode] = useState(`${classData.code}${classData.name}`);
        const [formData, setFormData] = useState({ id: classData.id, code: classData.code || '', name: classData.name || '', section: classData.section || '', instructor: classData.instructor || '', courseCodeValid: true, sectionCodeValid: true });
        const [modified, setModified] = useState({ code: false, section: false, instructor: false, });
        useEffect(() => { setFormData({ id: classData.id, code: classData.code || '', name: classData.name || '', section: classData.section || '', instructor: classData.instructor || '' }); setDisplayedCourseCode( (classData.code && classData.name) ? `${classData.code}${classData.name}` : (classData.code || '') ); }, [classData]);
        const handleDelete = () => { onDelete(classData.id); };
        const handleChange = (e) => { const { name, value } = e.target; if (name === 'code') { setDisplayedCourseCode(value); const cleanedValue = value.replace(/\s+/g, '').toUpperCase(); const courseCodeRegex = /^([A-Z]{1,3})(\d{3})$/; const match = cleanedValue.match(courseCodeRegex); if (match) { setFormData(prev => ({ ...prev, code: match ? match[1] : '', name: match ? match[2] : '', courseCodeValid: true })); } else { setFormData(prev => ({ ...prev, courseCodeValid: false })); } } else if (name === 'section') { const cleanedValue = value.replace(/\s+/g, ''); const sectionRegex = /^\d{3}([A-Z])?$/; const isValid = sectionRegex.test(cleanedValue) || value === '' || !value; setFormData(prev => ({ ...prev, [name]: value, sectionCodeValid: isValid })); } else { setFormData(prev => ({ ...prev, [name]: value })); } setModified(prev => ({ ...prev, [name]: true })); };
        const handleBlur = async (e) => { const { name } = e.target; if (modified[name]) { if (!formData.courseCodeValid && name === 'code') { console.error("Valid course code required (e.g., CSC116)"); return; } if (!formData.sectionCodeValid && name === 'section') { console.error("Valid section required (3 digits with optional letter)"); return; } onUpdate(formData); setModified(prev => ({ ...prev, [name]: false })); } };

        return (
          <div className={ss.classCard}>
            <div className={ss.cardHeader}>
              <input
                type="text" name="code" value={displayedCourseCode}
                onChange={handleChange} onBlur={handleBlur}
                className={ss.inputField} placeholder="Course (e.g. CSC116)"
              />
              <button type="button" className={ss.iconButton} onClick={handleDelete}>
                <Trash2 size={16} />
              </button>
            </div>
            <input
              type="text" name="section" value={formData.section}
              onChange={handleChange} onBlur={handleBlur}
              className={ss.inputField} placeholder="Section (e.g. 001)"
            />
            <input
              type="text" name="instructor" value={formData.instructor}
              onChange={handleChange} onBlur={handleBlur}
              className={ss.inputField} placeholder="Instructor (optional)"
            />
          </div>
        );
    };

    const AddClassCard = ({ onClick }) => (
      <div className={ss.addClassCard} onClick={onClick}>
        <button className={ss.addButtonCard}>
          <Plus size={20} />
          <span>Add Course</span>
        </button>
      </div>
    );
    
    const renderClasses = () => (
        <div className={ss.classesContainer}>
            {classes.map((classItem) => (
                <ClassCard
                    key={classItem.id} classData={classItem}
                    onUpdate={handleUpdateClass} onDelete={handleDeleteClass} />
            ))}
            <AddClassCard onClick={handleAddClass} />
        </div>
    );

    if (error) {
        return (
            <div className={ss.schedulerPage}>
                <Sidebar />
                <div style={{padding: '2rem', textAlign: 'center', width: '100%'}}>
                    <div style={{marginBottom: '1rem'}}>{error}</div>
                    <button className={`${ss.button} ${ss['button-primary']}`} onClick={loadPage}>
                        Retry Load
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={ss.schedulerPage}>
            <Sidebar />
            <main className={ss.mainContent}>
                <div className={ss.calendarContainer}>
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
                </div>
                <aside className={ss.controlPanel}>
                    <div className={ss.generationControls}>
                        <button
                            className={`${ss.button} ${ss['button-primary']}`}
                            onClick={generateSchedules}
                            disabled={isScraping}
                        >
                            {isScraping ? "Generating..." : "Generate Schedules"}
                        </button>
                        <div className={ss.paramToggles}>
                            <button className={`${ss.button} ${ss.toggleButton} ${paramCheckboxes.box1 ? ss.active : ''}`} onClick={() => toggleParamCheckbox('box1')}>
                                Open Sections Only
                            </button>
                            <button className={`${ss.button} ${ss.toggleButton} ${paramCheckboxes.box2 ? ss.active : ''}`} onClick={() => toggleParamCheckbox('box2')}>
                                Waitlist OK
                            </button>
                        </div>
                        {isScraping && (
                            <div className={ss['loading-indicator']}>
                                <div className={ss['spinner']}></div>
                                <p>Scraping in progress...</p>
                            </div>
                        )}
                        {scrapeStatus && !isScraping && (
                            <div className={`${ss['status-message']} ${
                                scrapeStatus.includes("Error") || scrapeStatus.includes("failed") ? ss['status-error'] : ss['status-success']
                            }`}>
                                {scrapeStatus}
                            </div>
                        )}
                    </div>
                    <div className={ss.listContainer}>
                        <div className={ss.listTabs}>
                            <button className={`${ss.tabButton} ${activeTab === 'schedules' ? ss.active : ''}`} onClick={() => setActiveTab('schedules')}>
                                Schedules
                            </button>
                            <button className={`${ss.tabButton} ${activeTab === 'classes' ? ss.active : ''}`} onClick={() => setActiveTab('classes')}>
                                Courses
                            </button>
                        </div>
                        <div className={ss.listContent}>
                           {activeTab === 'schedules' && renderScrollbar()}
                           {activeTab === 'classes' && renderClasses()}
                        </div>
                    </div>
                </aside>
            </main>
        </div>
    );
};

export default Scheduler;