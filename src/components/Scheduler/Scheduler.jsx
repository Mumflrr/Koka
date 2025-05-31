import React, { useState, useEffect, useMemo } from 'react';
import {Trash2} from 'lucide-react';
import { invoke } from "@tauri-apps/api/tauri";
import processEvents from '../CalendarGrid/processEvents';
import CalendarGrid from '../CalendarGrid/CalendarGrid';
import Sidebar from "../Sidebar/Sidebar";
import ss from './Scheduler.module.css';


 // TODO add button to re-scrape classes in list
 // TODO how to handle partial instructor names
 // FIXME make section and classname fields required for add class modal
 // TODO update loading animation when scraping
 // TODO Check if works if we navigate away

// Helper function to consistently stringify a schedule
const stringifySchedule = (schedule) => {
    try {
        return JSON.stringify(schedule);
    } catch (e)        {
        console.error("Failed to stringify schedule:", schedule, e);
        return null; // TODO Handle error case
    }
};

const Scheduler = () => {
    // Core state
    const [userEvents, setUserEvents] = useState([]); // Changed from 'events' to 'userEvents'
    const [currentHoveredSchedule, setCurrentHoveredSchedule] = useState(null); // Added state for hovered schedule
    const [schedules, setSchedules] = useState([]);
    const [classes, setClasses] = useState([]);
    const schedulesStringArray = useMemo(() => {
        // Simply return the result of map and filter
        return schedules.map(stringifySchedule).filter(s => s !== null);
    }, [schedules]); // Recalculate only when schedules changes

    // UI State
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [renderFavorites, setRenderFavorites] = useState(false);
    const [seed, setSeed] = useState(1);
    const reset = () => {
        updateSchedulePage();
        setSeed(Math.random());
    }

    // Store favorite schedules as the actual objects/arrays
    const [favoritedSchedules, setFavoritedSchedules] = useState([]); // Initialize as empty array
    // Derived state: A Set of stringified favorites for efficient lookups
    const favoritedScheduleStrings = useMemo(() => {
        return new Set(favoritedSchedules.map(stringifySchedule).filter(s => s !== null));
    }, [favoritedSchedules]); // Recalculate only when favoritedSchedules changes

    // Scraping state
    const [scrapeState, setScrapeState] = useState({
        isScraping: false,
        status: "",
    });
    const { isScraping, status: scrapeStatus } = scrapeState;
    const [paramCheckboxes, setParamCheckboxes] = useState({
        box1: false,
        box2: false,
        // 'Only fit in calendar' should always be false
    });

    useEffect(() => {
        loadPage();
        return () => { };
    }, []);

        // Helper function to format integer time (e.g., 1145) to "HH:mm" string
    const formatTimeIntToString = (timeInt) => {
        if (timeInt === null || timeInt === undefined || timeInt === -1) {
            return '00:00'; // Or some default/error string
        }
        const timeStr = String(timeInt).padStart(4, '0');
        return `${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}`;
    };

    // Derived state: Combines user events with hovered schedule and processes them for CalendarGrid
    const processedEventsForGrid = useMemo(() => {
        let combinedRawEvents = [...userEvents]; // Start with user's saved events

        if (currentHoveredSchedule && Array.isArray(currentHoveredSchedule)) {
            const previewEvents = currentHoveredSchedule.flatMap((courseData, courseIndex) => {
                if (!courseData || !courseData.classes || !Array.isArray(courseData.classes)) {
                    // console.warn("Skipping courseData due to missing or invalid 'classes' array:", courseData);
                    return []; // Skip this course if 'classes' is not a valid array
                }

                return courseData.classes.map((classMeeting, meetingIndex) => {
                    if (!classMeeting || !classMeeting.days || !Array.isArray(classMeeting.days)) {
                        // console.warn("Skipping classMeeting due to missing or invalid 'days' array:", classMeeting);
                        return null; 
                    }

                    let dayBitmask = 0;
                    let meetingStartTimeInt = null;
                    let meetingEndTimeInt = null;

                    classMeeting.days.forEach((dayInfo, dayUiIndex) => {
                        // dayInfo is like [[1145, 1235], true] or [[-1, -1], false]
                        // dayUiIndex: 0=Mon, 1=Tue, ..., 4=Fri
                        
                        if (!Array.isArray(dayInfo) || dayInfo.length < 2 || 
                            !Array.isArray(dayInfo[0]) || dayInfo[0].length < 2) {
                            // console.warn("Skipping dayInfo due to invalid structure:", dayInfo);
                            return; // Skip malformed dayInfo
                        }

                        const timePair = dayInfo[0]; // [startTime, endTime] e.g. [1145, 1235] or [-1, -1]
                        const isActive = dayInfo[1];   // boolean

                        if (isActive && timePair[0] !== -1) {
                            // UI dayIndex 0 (Monday) corresponds to bit 1 (1 << (0 + 1))
                            // UI dayIndex 1 (Tuesday) corresponds to bit 2 (1 << (1 + 1))
                            dayBitmask |= (1 << (dayUiIndex + 1));

                            if (meetingStartTimeInt === null) {
                                meetingStartTimeInt = timePair[0];
                                meetingEndTimeInt = timePair[1];
                            }
                        }
                    });

                    if (dayBitmask === 0 || meetingStartTimeInt === null) {
                        return null; // No active days or times for this meeting
                    }

                    const courseIdPart = courseData.id || `${courseData.code || 'course'}${courseData.name || courseIndex}`;
                    const meetingIdPart = classMeeting.section || meetingIndex;
                    const eventId = `hover-${courseIdPart}-${meetingIdPart}`;
                    
                    const title = `${courseData.code || ''} ${courseData.name || ''}`.trim() +
                                  (classMeeting.section ? ` - Sec ${classMeeting.section}` : '');

                    return {
                        id: eventId,
                        isPreview: true,
                        title: title,
                        professor: classMeeting.instructor || '',
                        description: courseData.description || '', // Or more specific like classMeeting.location
                        // Add other relevant fields if needed by Event component, e.g., location
                        // location: classMeeting.location || '', 
                        
                        startTime: formatTimeIntToString(meetingStartTimeInt),
                        endTime: formatTimeIntToString(meetingEndTimeInt),
                        day: dayBitmask,
                    };
                }).filter(event => event !== null); // Filter out nulls if a classMeeting was invalid
            });
            combinedRawEvents = [...combinedRawEvents, ...previewEvents];
        }
        
        return processEvents(combinedRawEvents); // Process the combined list for layout
    }, [userEvents, currentHoveredSchedule]);


    const loadPage = async() => {
        try {
            setLoading(true);
            setError(null);

            updateSchedulePage();
            const loadedClasses = await invoke('get_classes');
            console.log(loadedClasses);
            setClasses(loadedClasses);

       } catch (err) {
            console.error('Error loading page data:', err);
            setError('Failed to load schedule data. Please try again later.');
            setUserEvents([]); // Was setEvents, now setUserEvents
            setSchedules([[]]);
            setFavoritedSchedules([]);
        } finally {
            setLoading(false);
        }
    }

    const updateSchedulePage = async() => {
        try {
            const loadedEvents = await invoke('get_events', {table: "scheduler"});
            setUserEvents(loadedEvents || []); // Was setEvents(processEvents(...)), now setUserEvents with raw data

            // Load generated schedules first
            let loadedSchedules = await invoke('get_schedules', {table: "combinations"});
            if (Array.isArray(loadedSchedules) && loadedSchedules.length > 0) {
                setSchedules(loadedSchedules);
            } else {
                setSchedules([[]]); // Ensure it's an array containing an empty array if no schedules
            }

            // Load favorite schedules
            loadedSchedules = await invoke('get_schedules', {table: "favorites"});
            if (Array.isArray(loadedSchedules) && loadedSchedules.length > 0) {
                setFavoritedSchedules(loadedSchedules);
            } else {
                setFavoritedSchedules([]); // Ensure it's an empty array if no favorites
            }

        } catch (err) {
            console.error('Error in updateSchedulePage:', err);
            throw err; // Rethrow to be caught by loadPage
        }
    }

{/*<!-----------------------------------End Setup Functions-----------------------------------!> */}
{/*<!----------------------------------Start Render Functions---------------------------------!> */}

    const renderScrollbar = () => {
        // Determine which schedules to display *first*
        const schedulesToRender = renderFavorites ? favoritedSchedules : schedules;
        // Check if the list *we intend to render* is effectively empty
        // Handles both empty array and array containing only an empty array (initial state)
        const isEmpty = !schedulesToRender.length || (schedulesToRender.length === 1 && !schedulesToRender[0]?.length);

        // Early return if the list being rendered is empty
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
                    // Get schedule information
                    const currentScheduleString = stringifySchedule(schedule);
                    const isFavorite = currentScheduleString !== null && favoritedScheduleStrings.has(currentScheduleString);

                    // Find the original index in the *generated* schedules list for display numbering consistency
                    // If not found (e.g., favorite from a previous generation), use '?' or maybe index within favorites?
                    // For now, stick to index from generated list if possible.
                    const displayIndex = schedulesStringArray.indexOf(currentScheduleString);
                    // Use displayIndex + 1 if found, otherwise maybe just 'Fav' or '?' when showing favorites?
                    // Let's keep it simple: use the index from the main list if available.
                    const displayNum = displayIndex !== -1 ? displayIndex + 1 : "?";

                    return (
                        <div
                            key={currentScheduleString} // Use the unique stringified schedule as the key
                            className={ss['item-slot']}
                            onClick={() => scheduleMenuClick(schedule)} // Pass the actual schedule object if needed
                            onMouseEnter={() => scheduleMenuHover(schedule)} // Added
                            onMouseLeave={handleScheduleMenuLeave} // Added
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
                                    e.stopPropagation(); // Added to prevent parent click
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

    //FIXME Standardize modules css use
    const ClassCard = ({ classData, onUpdate, onDelete }) => {
        // Add a new state for the displayed course code
        const [displayedCourseCode, setDisplayedCourseCode] = useState(`${classData.code}${classData.name}`);

        // Data for managing and sending to frontend
        const [formData, setFormData] = useState({
            id: classData.id,
            code: classData.code || '',
            name: classData.name || '',
            section: classData.section || '',
            instructor: classData.instructor || '',
            courseCodeValid: true,
            sectionCodeValid: true
        });

        // Track which fields have been modified
        const [modified, setModified] = useState({
            code: false,
            section: false,
            instructor: false,
        });

        // Update local state when classData changes post initial load
        useEffect(() => {
            setFormData({
                id: classData.id,
                code: classData.code || '',
                name: classData.name || '',
                section: classData.section || '',
                instructor: classData.instructor || ''
            });

            // Also update the displayed course code
            setDisplayedCourseCode(
                (classData.code && classData.name) ? `${classData.code}${classData.name}` : (classData.code || '')
            );
        }, [classData]);

        const handleDelete = () => {
            onDelete(classData.id);
        };

        const handleChange = (e) => {
            const { name, value } = e.target;

            // Special handling for course code input
            if (name === 'code') {
                // Update the displayed value immediately
                setDisplayedCourseCode(value);

                // Remove any whitespace and convert to uppercase
                const cleanedValue = value.replace(/\s+/g, '').toUpperCase();
                // Regular expression to match a valid course code pattern (e.g., CSC116)
                const courseCodeRegex = /^([A-Z]{1,3})(\d{3})$/;
                // Get matched strings according to regex
                const match = cleanedValue.match(courseCodeRegex);

                if (match) {
                    // If it's a valid format, update the form data with separated values
                    setFormData(prev => ({
                        ...prev,
                        // Split into separate code and name fields
                        code: match ? match[1] : '',  // The letters part (e.g., "CSC")
                        name: match ? match[2] : '',  // The numbers part (e.g., "116")
                        courseCodeValid: true
                    }));

                } else {
                    // If invalid format, determine of string is empty for frontend purposes
                    setFormData(prev => ({
                        ...prev,
                        courseCodeValid: false
                    }));
                }
            }
            // Special handling for section input
            else if (name === 'section') {
                // Remove any whitespace
                const cleanedValue = value.replace(/\s+/g, '');
                // Regular expression to match exactly 3 digits followed by an optional uppercase letter
                const sectionRegex = /^\d{3}([A-Z])?$/;
                // Check if inputted value is valid according to regex
                const isValid = sectionRegex.test(cleanedValue) || value === '' || !value;
                if (isValid) {
                    // Update form data
                    setFormData(prev => ({
                        ...prev,
                        [name]: value,
                        sectionCodeValid: true
                    }));
                }
                else {
                    setFormData(prev => ({
                        ...prev,
                        [name]: value,
                        sectionCodeValid: false
                    }));
                }
            } else {
                // Original behavior for other fields
                setFormData(prev => ({
                    ...prev,
                    [name]: value
                }));
            }

            setModified(prev => ({
                ...prev,
                [name]: true
            }));
        };

        const handleBlur = async (e) => {
            const { name } = e.target;

            // Only perform validation if the field was modified
            if (modified[name]) {
                if (!formData.courseCodeValid && name === 'code') {
                    console.error("Valid course code required (e.g., CSC116)");
                    return; // Don't update if invalid
                }

                if (!formData.sectionCodeValid && name === 'section') {
                    console.error("Valid section required (3 digits with optional letter)");
                    return; // Don't update if invalid
                }

                // Only submit if field was modified AND is valid
                onUpdate(formData);

                // Reset modified state for this field after successful update
                setModified(prev => ({
                    ...prev,
                    [name]: false
                }));
            }
        };

        return (
          <div className={ss.classCard}>
            <form>
              <div className={ss.cardHeader}>
                <div className={ss.classTitle}>
                <input
                    type="text"
                    name="code"
                    value={displayedCourseCode}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={ss.inputField}
                    placeholder="Course (ex. CSC116)"
                />
                  <span> | Section: </span>
                  <input
                    type="text"
                    name="section"
                    value={formData.section}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={ss.inputField}
                    placeholder="Section (ex. 001 or 001A)"
                  />
                </div>


                <div className={ss.menuActions}>
                        <button
                            type="button"
                            className={ss.deleteButton}
                            onClick={handleDelete}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                            </svg>
                        </button>
                </div>



                <button type="button" className={ss.menuButton}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="19" cy="12" r="1" />
                    <circle cx="5" cy="12" r="1" />
                  </svg>
                </button>
              </div>

              <div className={ss.classInfo}>
                <p>001: Days + Time</p>
                {classData.name === "116" && <p className={ss.location}>Location</p>}
                <div className={ss.instructorWrapper}>
                  <div className={ss.avatarCircle}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    name="instructor"
                    value={formData.instructor}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={ss.inputField}
                    placeholder="Professor Name"
                  />
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
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <span>Add Class</span>
          </button>
        </div>
      );
    };


    const handleUpdateClass = async (classData) => {

        try {
            // Update database
            await invoke('update_classes', {class: classData});

            // Update frontend
            setClasses(prev =>
                prev.map(item =>
                    item.id === classData.id ? { ...classData} : item
                )
            );
        } catch (err) {
            console.error("Error updating class:", err);
            //setError("Failed to update class");
        }

    };

    const handleDeleteClass = async (id) => {
        try {
            // Remove from database
            await invoke('remove_class', { id: id });

            // Remove from state
            setClasses(prev => prev.filter(item => item.id !== id));
        } catch (err) {
            console.error("Error deleting class:", err);
            //setError
        }
    };

    // When creating a new class
    const handleAddClass = () => {
        const newClass = {
            id: Date.now().toString(), // Convert to string for consistency
            code: '',
            name: '',
            section: '',
            instructor: ''
        };
        setClasses(prev => [...prev, newClass]);
    };

    const renderClasses = () => {
        return (
            <div className={ss.container}>
                <div className={ss.classesWrapper}>
                    {classes.map((classItem) => (
                        <ClassCard
                            key={classItem.id}
                            classData={classItem}
                            onUpdate={handleUpdateClass}
                            onDelete={handleDeleteClass}
                        />
                    ))}
                    <AddClassCard onClick={handleAddClass} />
                </div>
            </div>
        );
    };

{/*<!-----------------------------------End Render Functions----------------------------------!> */}
{/*<!---------------------------------Start Runtime Functions---------------------------------!> */}

    const handleCreateEvent = async (newEvent) => { // newEvent is raw event data from form
        try {
            const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const eventToSave = { ...newEvent, id: uniqueId };
            await invoke('create_event', { event: eventToSave, table: "scheduler" });
            setUserEvents(prevEvents => [...prevEvents, eventToSave]); // Update raw userEvents
        } catch (err) {
            console.error('Error saving event:', err);
            setError('Failed to save event. Please try again.');
        }
    };

    const handleDeleteEvent = async (eventId) => { // eventId refers to a userEvent
        const originalUserEvents = [...userEvents]; // Store copy of raw userEvents
        setUserEvents(prevEvents => prevEvents.filter(e => e.id !== eventId)); // Update raw userEvents
        try {
            await invoke('delete_event', { eventId, table: "scheduler" });
        } catch (err) {
            console.error('Error deleting event:', err);
            setError('Failed to delete event. Please try again.');
            setUserEvents(originalUserEvents); // Restore raw userEvents on error
        }
    };

    const handleUpdateEvent = async (updatedEvent) => { // updatedEvent is raw event data from form
        const originalUserEvents = [...userEvents]; // Store copy of raw userEvents
        setUserEvents(prevEvents => { // Update raw userEvents
            const filtered = prevEvents.filter(e => e.id !== updatedEvent.id);
            return [...filtered, updatedEvent];
        });
        try {
            await invoke('update_event', { event: updatedEvent, table: "scheduler" });
        } catch (err) {
            console.error('Error updating event:', err);
            setError('Failed to update event. Please try again.');
            setUserEvents(originalUserEvents); // Restore raw userEvents on error
        }
    };

    const generateSchedules = async () => {
        setScrapeState({ isScraping: true, status: "Starting scrape..." });

        try {
             const formattedUserEvents = userEvents.map(event => ({ // Uses raw userEvents
                 time: [event.startTime, event.endTime], // Ensure these field names match your raw event structure
                 days: event.day // Ensure this field name matches your raw event structure
             }));

             const result = await invoke("generate_schedules", {
                parameters: {
                    params_checkbox: [
                        paramCheckboxes.box1,
                        paramCheckboxes.box2,
                        false // "Only fit in calendar" is always false as per your comment
                    ],
                    classes: classes,
                    events: formattedUserEvents
                }
            });

            if (typeof result === 'string') {
                console.error("Scrape error:", result);
                setScrapeState({ isScraping: false, status: `Error: ${result}` });
                setSchedules([[]]);
                setFavoritedSchedules([]); // Clear favorites as schedules changed
            } else if (Array.isArray(result)) {
                console.log("Scrape successful:", result);
                const numSchedules = result.length;
                setScrapeState({
                    isScraping: false,
                    status: numSchedules > 0 ? `Scrape completed, found ${numSchedules} schedules.` : "Scrape completed. No matching schedules found."
                });
                 setSchedules(numSchedules > 0 && result[0].length > 0 ? result : [[]]);
                // Clear existing favorites when new schedules are generated
                setFavoritedSchedules([]);
                await updateSchedulePage(); // Refresh favorites from DB (should be empty now)
                setSeed(Math.random()); // Force scrollbar re-render
            } else {
                 console.error("Scrape returned unexpected data:", result);
                 setScrapeState({ isScraping: false, status: `Error: Received unexpected data from backend.` });
                 setSchedules([[]]);
                 setFavoritedSchedules([]);
            }
        } catch (error) {
            console.error("Scrape invocation failed:", error);
            setError(`Unable to scrape: ${error.message || error}`); // Display error message correctly
            setScrapeState({ isScraping: false, status: `Scrape failed: ${error.message || 'Unknown error'}` });
            setSchedules([[]]);
            setFavoritedSchedules([]);
        }
    };

    // Toggles the favorite status of a schedule
    const changeFavoriteStatus = async (scheduleData, scheduleString, isCurrentlyFavorite) => {
        try {
            await invoke("change_favorite_schedule", {
                id: scheduleString, // Use the stringified version as the ID
                isFavorited: isCurrentlyFavorite,
                schedule: scheduleData
            });
            await updateSchedulePage(); // Reload schedules and favorites from DB
            setSeed(Math.random()); // Force scrollbar re-render

        } catch (error) {
            console.error("Failed to update favorite status:", error);
            setError(`Failed to update favorite status for schedule.`);
        }
    }

    const deleteSchedule = async (id, isCurrentlyFavorite) => {
        try {
            await invoke("delete_schedule", {
                id: id, // Use the stringified version as the ID
                isFavorited: isCurrentlyFavorite
            });

            // Refresh the UI
            await updateSchedulePage(); // Reload schedules and favorites from DB
            setSeed(Math.random()); // Force scrollbar re-render
        } catch (error) {
            console.error("Failed to delete schedule:", error);
            setError(`Failed to delete schedule.`);
        }
    }

    const scheduleMenuClick = async (scheduleData) => {
        console.log("Clicked schedule:", scheduleData);
        setCurrentHoveredSchedule(null); // Clear hover on click
        // TODO: Implement logic to save the clicked schedule so whenever the page is mounted, that
        // schedule will automatically populate
    }

    // Modified to set currentHoveredSchedule
    const scheduleMenuHover = (scheduleData) => {
        console.log("Hovered schedule:", scheduleData);
        setCurrentHoveredSchedule(scheduleData);
    }

    // Added: handler to clear hovered schedule
    const handleScheduleMenuLeave = () => {
        setCurrentHoveredSchedule(null);
    }

    const toggleParamCheckbox = (boxName) => {
        setParamCheckboxes(prev => ({
            ...prev,
            [boxName]: !prev[boxName]
        }));
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
                    events={processedEventsForGrid} // Pass the combined and processed events
                    onEventCreate={handleCreateEvent}
                    onEventDelete={handleDeleteEvent}
                    onEventUpdate={handleUpdateEvent}
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

                {/* Scrape status is always shown when available */}
                {scrapeStatus && (
                    <div className={`${ss['status-message']} ${
                        scrapeStatus.includes("Error") ? ss['status-error'] : ss['status-success']
                    }`}>
                        {scrapeStatus}
                    </div>
                )}


                <button onClick={e => (setRenderFavorites(!renderFavorites))}>
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