import React, { useState, useEffect, useMemo } from 'react'; 
import {Trash2} from 'lucide-react';
import { invoke } from "@tauri-apps/api/tauri";
import processEvents from '../CalendarGrid/processEvents';
import CalendarGrid from '../CalendarGrid/CalendarGrid';
import Sidebar from "../Sidebar/Sidebar";
import ss from './Scheduler.module.css';


 // TODO Responsiveness
 // TODO Fix top bar not shadowing on modal opening
 // TODO add button to cache certain classes even if not in list
 // TODO add button to re-scrape classes in list
 // TODO fix deleting one block of multi-day event not deleting all blocks
 // TODO how to handle partial instructor names
 // FIXME make section and classname fields required for add class modal
 // FIXME update error handling consistency
 // TODO update loading animation when scraping
 // TODO Check if works if we navigate away

// Helper function to consistently stringify a schedule
const stringifySchedule = (schedule) => {
    try {
        return JSON.stringify(schedule);
    } catch (e) {
        console.error("Failed to stringify schedule:", schedule, e);
        return null; // TODO Handle error case
    }
};

const Scheduler = () => {
    // Core state
    const [events, setEvents] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [classes, setClasses] = useState([]);
    
    const scheduleStrings = useMemo(() => {
        return new Set(schedules.map(stringifySchedule).filter(s => s !== null));
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
    
    // Map to track the index of each favorited schedule in the main schedules array
    const [favoriteSchedulesMap, setFavoriteSchedulesMap] = useState({});

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
    const {box1, box2} = paramCheckboxes;

    useEffect(() => {
        loadPage();
        return () => { };
    }, []);

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
            setEvents([]);
            setSchedules([[]]);
            setFavoritedSchedules([]);
        } finally {
            setLoading(false);
        }
    }

    const updateSchedulePage = async() => {
        try {
            const loadedEvents = await invoke('get_events', {table: "scheduler"});
            setEvents(processEvents(loadedEvents || []));

            // Load generated schedules first
            const loadedSchedules = await invoke('get_schedules', {table: "combinations"});
            if (Array.isArray(loadedSchedules) && loadedSchedules.length > 0) {
                setSchedules(loadedSchedules);
            } else {
                console.warn("Loaded schedules is not a non-empty array:", loadedSchedules);
                setSchedules([[]]); // Default placeholder
            }

            // Then load favorite schedules
            const loadedFavoriteSchedules = await invoke('get_schedules', {table: "favorites"});
            if (Array.isArray(loadedFavoriteSchedules)) {
                setFavoritedSchedules(loadedFavoriteSchedules);
                
                // Create a new map to track favorite indices
                const newFavoriteSchedulesMap = {};
                
                // For each favorite schedule, find its index in the full schedules array
                loadedFavoriteSchedules.forEach((favoriteSchedule) => {
                    const favoriteString = stringifySchedule(favoriteSchedule);
                    if (favoriteString !== null) {
                        // Find the index of this favorite schedule in the full schedules array
                        const scheduleIndex = loadedSchedules.findIndex(schedule => 
                            stringifySchedule(schedule) === favoriteString
                        );
                        
                        // If found, add the mapping using the favoriteString as key
                        if (scheduleIndex !== -1) {
                            newFavoriteSchedulesMap[favoriteString] = scheduleIndex;
                        }
                    }
                });
                
                setFavoriteSchedulesMap(newFavoriteSchedulesMap);
                console.log("Updated favoriteSchedulesMap:", newFavoriteSchedulesMap);
            } else {
                console.warn("Loaded favorite schedules is not an array:", loadedFavoriteSchedules);
                setFavoritedSchedules([]);
                setFavoriteSchedulesMap({});
            }
        } catch (err) {
            console.error('Error in updateSchedulePage:', err);
            throw err; // Rethrow to be caught by loadPage
        }
    }

{/*<!-----------------------------------End Setup Functions-----------------------------------!> */}
{/*<!----------------------------------Start Render Functions---------------------------------!> */}

    const renderScrollbar = () => {
        // Early return if no schedules
        if (!schedules.length || (schedules.length === 1 && !schedules[0].length)) {
            return (
                <div className={ss['scrollbar-wrapper']}>
                    <div className={ss['empty-message']}>No schedules generated yet.</div>
                </div>
            );
        }

        // Determine which schedules to display
        const schedulesToRender = renderFavorites ? favoritedSchedules : schedules;
        
        return (
            <div className={ss['scrollbar-wrapper']} key={renderFavorites ? 'favorites' : seed}>
                {schedulesToRender.map((schedule, i) => {
                    // Get schedule information
                    const currentScheduleString = stringifySchedule(schedule);
                    const isFavorite = currentScheduleString !== null && favoritedScheduleStrings.has(currentScheduleString);
                    
                    // Get the relevant indices for this schedule
                    let scheduleIndex = i;
                    let favoriteIndex = -1;
                    
                    if (renderFavorites) {
                        // We're in favorites view, find the main schedule index
                        scheduleIndex = favoriteSchedulesMap[currentScheduleString] !== undefined 
                            ? favoriteSchedulesMap[currentScheduleString] 
                            : -1;
                        favoriteIndex = i;
                    } else if (isFavorite) {
                        // We're in regular view, find the favorite index
                        favoriteIndex = favoritedSchedules.findIndex(fav => 
                            stringifySchedule(fav) === currentScheduleString
                        );
                    }
                    
                    // Calculate display number
                    const displayNumber = renderFavorites 
                        ? (favoriteSchedulesMap[currentScheduleString] !== undefined 
                            ? favoriteSchedulesMap[currentScheduleString] + 1 
                            : i + 1)
                        : i + 1;

                    return (
                        <div 
                            key={i}
                            className={ss['item-slot']}
                            onClick={() => scheduleMenuClick(i)}
                        >
                            <button
                                className={`${ss['favorite-button']} ${isFavorite ? ss['favorited'] : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    changeFavoriteStatus(schedule, scheduleIndex, isFavorite);
                                }}
                                aria-label={`${isFavorite ? 'Unfavorite' : 'Favorite'} Schedule ${displayNumber}`}
                            >
                                {isFavorite ? '★' : '☆'}
                            </button>
                            <p>Schedule {displayNumber}</p>
                            <button
                                className={ss['delete-button']}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    deleteSchedule(scheduleIndex, favoriteIndex, isFavorite);
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
        const [displayedCourseCode, setDisplayedCourseCode] = useState(
            // If we have both code and name, combine them, otherwise use whatever is in classData.code
            (classData.code && classData.name) ? `${classData.code}${classData.name}` : (classData.code || '')
        );
        
        const [formData, setFormData] = useState({
            code: classData.code || '',
            name: classData.name || '',
            section: classData.section || '',
            instructor: classData.instructor || ''
        });
        
        // Track which fields have been modified
        const [modified, setModified] = useState({
            code: false,
            name: false,
            section: false,
            instructor: false
        });
        
        // Update local state when props change (important for initial load)
        useEffect(() => {
            setFormData({
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
            onDelete(classData);
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
                const match = cleanedValue.match(courseCodeRegex);
                
                if (match || value === '') {
                    // If it's a valid format or empty, update the form data with separated values
                    setFormData(prev => ({
                        ...prev,
                        // Split into separate code and name fields
                        code: match ? match[1] : '',  // The letters part (e.g., "CSC")
                        name: match ? match[2] : '',  // The numbers part (e.g., "116")
                        courseCodeValid: true
                    }));
                    
                    setModified(prev => ({
                        ...prev,
                        code: true,
                        name: true
                    }));
                } else {
                    // If invalid format, still update the backend values but mark as invalid
                    setFormData(prev => ({
                        ...prev,
                        code: value, // Store the entire value in code field temporarily
                        name: '',     // Clear the name field
                        courseCodeValid: false
                    }));
                    
                    setModified(prev => ({
                        ...prev,
                        code: true,
                        name: false
                    }));
                }
            } 
            // Special handling for section input
            else if (name === 'section') {
                // Remove any whitespace
                const cleanedValue = value.replace(/\s+/g, '');
                
                // Regular expression to match exactly 3 digits followed by an optional uppercase letter
                const sectionRegex = /^\d{3}([A-Z])?$/;
                const isValid = sectionRegex.test(cleanedValue) || value === '';
                
                // Update form data
                setFormData(prev => ({
                    ...prev,
                    [name]: value,
                    sectionValid: isValid
                }));
                
                setModified(prev => ({
                    ...prev,
                    [name]: true
                }));
            } else {
                // Original behavior for other fields
                setFormData(prev => ({
                    ...prev,
                    [name]: value
                }));
                
                setModified(prev => ({
                    ...prev,
                    [name]: true
                }));
            }
        };
    
        const handleBlur = async (e) => {
            const { name } = e.target;
        
            // Only submit if a field was modified
            if (modified[name]) {
                // Check if both code and section are valid
                const isCodeValid = formData.courseCodeValid !== false && formData.code !== '';
                const isSectionValid = formData.sectionValid !== false;
                
                if (isCodeValid && isSectionValid) {
                    // Create updated class data with the current ID
                    const updatedClassData = {
                        ...formData,
                        id: classData.id, // Ensure we keep the original ID
                        // If id is null or undefined, generate a new one
                        ...((!classData.id) && { id: Date.now().toString() })
                    };
                    
                    console.log("Class ID before update:", classData.id);
                    console.log("Updated class data:", updatedClassData);
                    
                    // Call the parent component's update function with the ID
                    onUpdate(classData.id || updatedClassData.id, updatedClassData);
        
                    try {
                        await invoke('update_classes', {
                            id: updatedClassData.id, // Use the potentially new ID
                            class: updatedClassData
                        });
                    } catch (err) {
                        console.error("Error updating classes:", err);
                    }
        
                    // Reset modified flags
                    setModified(prev => ({
                        ...prev,
                        [name]: false
                    }));
                } else {
                    if (!isCodeValid) {
                        console.error("Valid course code required (e.g., CSC116)");
                    }
                    if (!isSectionValid) {
                        console.error("Valid section required (3 digits with optional letter)");
                    }
                }
            }
        };
      
        return (
          <div className={ss.classCard}>
            <form>
              <div className={ss.cardHeader}>
                <div className={ss.classTitle}>
                <input
                    required
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
                    required
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
    
    const handleUpdateClass = (id, updatedData) => {
        console.log("Updating class with ID:", id);
        console.log("Updated data:", updatedData);
        
        setClasses(prev => 
            prev.map(item => 
                item.id === id ? { ...updatedData, id } : item
            )
        );
    };

    const handleDeleteClass = async (classObj) => {
        try {            
            // Remove from database
            await invoke('remove_class', { id: classObj.id });

            // Remove from state
            setClasses(prev => prev.filter(item => item.id !== classObj.id));
        } catch (err) {
            console.error("Error deleting class:", err);
            // Optionally revert state change if database operation fails
        }
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

    const handleCreateEvent = async (newEvent) => {
        try {
            const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const eventToSave = { ...newEvent, id: uniqueId };
            await invoke('create_event', { event: eventToSave, table: "scheduler" });
            setEvents(prevEvents => processEvents([...prevEvents, eventToSave]));
        } catch (err) {
            console.error('Error saving event:', err);
            setError('Failed to save event. Please try again.');
        }
    };

    const handleDeleteEvent = async (eventId) => {
        const originalEvents = events;
        setEvents(prevEvents => processEvents(prevEvents.filter(e => e.id !== eventId)));
        try {
            await invoke('delete_event', { eventId, table: "scheduler" });
        } catch (err) {
            console.error('Error deleting event:', err);
            setError('Failed to delete event. Please try again.');
            setEvents(originalEvents);
        }
    };

    const handleUpdateEvent = async (updatedEvent) => {
        const originalEvents = events;
        setEvents(prevEvents => {
            const filtered = prevEvents.filter(e => e.id !== updatedEvent.id);
            return processEvents([...filtered, updatedEvent]);
        });
        try {
            await invoke('update_event', { event: updatedEvent, table: "scheduler" });
        } catch (err) {
            console.error('Error updating event:', err);
            setError('Failed to update event. Please try again.');
            setEvents(originalEvents);
        }
    };

    const generateSchedules = async () => {
        setScrapeState({ isScraping: true, status: "Starting scrape..." });

        try {
             const formattedUserEvents = events.map(event => ({
                 time: [event.start, event.end],
                 days: event.days
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
                setFavoriteSchedulesMap({});
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
                setFavoriteSchedulesMap({});
            } else {
                 console.error("Scrape returned unexpected data:", result);
                 setScrapeState({ isScraping: false, status: `Error: Received unexpected data from backend.` });
                 setSchedules([[]]);
                 setFavoritedSchedules([]);
                 setFavoriteSchedulesMap({});
            }
        } catch (error) {
            console.error("Scrape invocation failed:", error);
            setError("Unable to scrape: {}", error);
            setScrapeState({ isScraping: false, status: `Scrape failed: ${error.message || 'Unknown error'}` });
            setSchedules([[]]);
            setFavoritedSchedules([]);
            setFavoriteSchedulesMap({});
        }
    };


    // Toggles the favorite status of a schedule
    const changeFavoriteStatus = async (scheduleData, scheduleIndex, isCurrentlyFavorite) => {
        const scheduleString = stringifySchedule(scheduleData);
        if (scheduleString === null) {
             setError("Failed to process schedule for favoriting.");
             return;
        }

        try {
            // Generate a unique ID for each favorite schedule
            // We'll use a hash of the schedule data + timestamp to ensure uniqueness
            let favoriteId = -1;
            
            if (isCurrentlyFavorite) {
                // Find the index in favoritedSchedules array
                favoriteId = favoritedSchedules.findIndex(fav => 
                    stringifySchedule(fav) === scheduleString
                );
            } else {
                // We're adding a new favorite, so generate a unique ID based on timestamp
                // This avoids ID conflicts with existing favorites
                favoriteId = Math.floor(Math.random() * 2147483647) + 1;
            }

            await invoke("change_favorite_schedule", {
                id: favoriteId,
                isFavorited: isCurrentlyFavorite,
                schedule: scheduleData
            });

            if (isCurrentlyFavorite) {
                // Remove from favorites
                setFavoritedSchedules(prevFavorites =>
                    prevFavorites.filter(fav => stringifySchedule(fav) !== scheduleString)
                );
                
                // Remove from map
                setFavoriteSchedulesMap(prev => {
                    const newMap = { ...prev };
                    delete newMap[scheduleString];
                    return newMap;
                });
            } else {
                // Add to favorites
                setFavoritedSchedules(prevFavorites => [...prevFavorites, scheduleData]);
                
                // Update map
                setFavoriteSchedulesMap(prev => ({
                    ...prev,
                    [scheduleString]: scheduleIndex
                }));
            }
            
            console.log(`Updated favorite status for schedule index: ${scheduleIndex} to ${!isCurrentlyFavorite}`);
            console.log("Updated favoriteSchedulesMap:", favoriteSchedulesMap);

        } catch (error) {
            console.error("Failed to update favorite status:", error);
            setError(`Failed to update favorite status for schedule ${scheduleIndex + 1}.`);
        }
    }

    const deleteSchedule = async (scheduleIndex, favoriteIndex, isCurrentlyFavorite) => {
        try {
            console.log(`Deleting schedule: scheduleIndex=${scheduleIndex}, favoriteIndex=${favoriteIndex}, isFavorited=${isCurrentlyFavorite}`);
            
            // Determine which schedule we're deleting
            let scheduleToDelete;
            
            if (renderFavorites) {
                // In favorites view, we're deleting from the favorites array
                scheduleToDelete = favoritedSchedules[favoriteIndex];
            } else {
                // In regular view, we're deleting from the main schedules array
                scheduleToDelete = schedules[scheduleIndex];
            }
            
            const scheduleString = stringifySchedule(scheduleToDelete);
            
            // Call backend to delete the schedule
            await invoke("delete_schedule", {
                idSchedule: scheduleIndex, 
                idFavorite: isCurrentlyFavorite ? favoriteIndex : -1, 
                isFavorited: isCurrentlyFavorite
            });
            
            // Update local state
            if (isCurrentlyFavorite) {
                // Remove from favorites
                setFavoritedSchedules(prev => 
                    prev.filter((_, i) => i !== favoriteIndex)
                );
                
                // Remove from map if it exists
                if (scheduleString) {
                    setFavoriteSchedulesMap(prev => {
                        const newMap = { ...prev };
                        delete newMap[scheduleString];
                        return newMap;
                    });
                }
            }
            
            // If we're deleting from the main schedules array
            if (!renderFavorites) {
                setSchedules(prev => 
                    prev.filter((_, i) => i !== scheduleIndex)
                );
                
                // Update all mappings that point to schedules after this one
                setFavoriteSchedulesMap(prev => {
                    const newMap = {};
                    Object.entries(prev).forEach(([key, value]) => {
                        if (value > scheduleIndex) {
                            // Decrement indices that come after the deleted one
                            newMap[key] = value - 1;
                        } else if (value < scheduleIndex) {
                            // Keep indices that come before the deleted one
                            newMap[key] = value;
                        }
                        // Skip the one that matches the deleted index
                    });
                    return newMap;
                });
            }
            
            // Refresh the UI
            await updateSchedulePage();
            setSeed(Math.random());
        } catch (error) {
            console.error("Failed to delete schedule:", error);
            setError(`Failed to delete schedule ${scheduleIndex + 1}.`);
        }
    }

    const scheduleMenuClick = async (index) => {
        console.log("Selected schedule index:", index);
        // TODO: Implement logic to display schedules[index]
    }

    // Toggle parameter checkboxes
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
                    events={events} 
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
                    Change favorite render
                </button>
                <button onClick={e => (setRenderFavorites(!box1))}>
                    Scrape open sections only
                </button>
                <button onClick={e => (setRenderFavorites(!box2))}>
                    Waitlist ok
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