import React, { useState, useEffect, useMemo } from 'react'; 
import {Trash2} from 'lucide-react';
import { invoke } from "@tauri-apps/api/tauri";
import processEvents from '../CalendarGrid/processEvents';
import CalendarGrid from '../CalendarGrid/CalendarGrid';
import Sidebar from "../Sidebar/Sidebar";
import ss from './Scheduler.module.css';

// Helper function to consistently stringify a schedule
const stringifySchedule = (schedule) => {
    try {
        return JSON.stringify(schedule);
    } catch (e) {
        console.error("Failed to stringify schedule:", schedule, e);
        return null; // Handle error case
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
    const [favoriteSchedulesMap, setFavoriteSchedulesMap] = useState([[]]);

    // Scraping state
    const [scrapeState, setScrapeState] = useState({
        isScraping: false,
        status: "",
    });
    const { isScraping, status: scrapeStatus } = scrapeState;
    const [scrapeParams, setScrapeParams] = useState({
        params_checkbox: [false, false, false],
        classes: [
            { code: "CSC", name: "116", section: "", instructor: "" },
            { code: "BIO", name: "183", section: "", instructor: "" }
        ],
        events: [ ]
    });

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
        const loadedEvents = await invoke('get_events', {table: "scheduler"});
        setEvents(processEvents(loadedEvents || []));

        // Load favorite schedules (assuming backend returns array of schedule objects/arrays)
        const loadedFavoriteSchedules = await invoke('get_schedules', {table: "favorites"});
        if (Array.isArray(loadedFavoriteSchedules)) {
                setFavoritedSchedules(loadedFavoriteSchedules);
                // The useMemo hook will automatically update favoritedScheduleStrings
        } else {
            console.warn("Loaded favorite schedules is not an array:", loadedFavoriteSchedules);
            setFavoritedSchedules([]);
        }

        // Load generated schedules
        const loadedSchedules = await invoke('get_schedules', {table: "combinations"});
        if (Array.isArray(loadedSchedules) && loadedSchedules.length > 0 && loadedSchedules[0].length > 0) {
            setSchedules(loadedSchedules);
            
            // Update favoriteSchedulesMap to map favorite indices to their positions in the full schedules array
            if (Array.isArray(loadedFavoriteSchedules) && loadedFavoriteSchedules.length > 0) {
                const newFavoriteSchedulesMap = [];
                
                // For each favorite schedule, find its index in the full schedules array
                loadedFavoriteSchedules.forEach((favoriteSchedule, favoriteIndex) => {
                    const favoriteString = stringifySchedule(favoriteSchedule);
                    if (favoriteString !== null) {
                        // Find the index of this favorite schedule in the full schedules array
                        const scheduleIndex = loadedSchedules.findIndex(schedule => 
                            stringifySchedule(schedule) === favoriteString
                        );
                        
                        // If found, add the mapping
                        if (scheduleIndex !== -1) {
                            newFavoriteSchedulesMap[favoriteIndex] = scheduleIndex;
                        } else {
                            // If not found in the full schedules, mark with -1 or handle as needed
                            newFavoriteSchedulesMap[favoriteIndex] = -1;
                        }
                    }
                });
                
                setFavoriteSchedulesMap(newFavoriteSchedulesMap);
                console.log("Updated favoriteSchedulesMap:", newFavoriteSchedulesMap);
            } else {
                setFavoriteSchedulesMap([]);
            }
        } else {
            console.warn("Loaded schedules is not a non-empty array:", loadedSchedules);
            setSchedules([[]]); // Default placeholder
            setFavoriteSchedulesMap([]);
        }
    }

{/*<!-----------------------------------End Setup Functions-----------------------------------!> */}
{/*<!----------------------------------Start Render Functions---------------------------------!> */}

    const renderScrollbar = () => {
        // Early return if no schedules
        if (!schedules.length || !schedules[0].length) {
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
                    
                    // Get indices for operations
                    const scheduleIndex = currentScheduleString !== null 
                        ? Array.from(scheduleStrings).indexOf(currentScheduleString)
                        : -1;
                        
                    const favoriteIndex = (currentScheduleString !== null && isFavorite)
                        ? Array.from(favoritedScheduleStrings).indexOf(currentScheduleString)
                        : -1;
                    
                    // Calculate display number (different for favorites vs regular view)
                    const displayNumber = renderFavorites 
                        ? favoriteSchedulesMap[i] + 1 
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
                                    changeFavoriteStatus(schedule, favoriteIndex, isFavorite);
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
    const ClassCard = ({ classData, onUpdate }) => {
        const [formData, setFormData] = useState({
          number: classData.number,
          section: classData.section,
          professor: classData.professor
        });
      
        const handleChange = (e) => {
          const { name, value } = e.target;
          setFormData(prev => ({
            ...prev,
            [name]: value
          }));
        };
      
        const handleSubmit = (e) => {
          e.preventDefault();
          onUpdate(classData.id, formData);
          setIsEditing(false);
        };
      
        return (
          <div className={ss.classCard}>
            <form onSubmit={handleSubmit}>
              <div className={ss.cardHeader}>
                <div className={ss.classTitle}>
                  <input
                    type="text"
                    name="number"
                    value={formData.number}
                    onChange={handleChange}
                    className={ss.inputField}
                    placeholder="Course Number"
                  />
                  <span> | Section: </span>
                  <input
                    type="text"
                    name="section"
                    value={formData.section}
                    onChange={handleChange}
                    className={ss.inputField}
                    placeholder="Section"
                  />
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
                {classData.number === "CSC 116" && <p className={ss.location}>Location</p>}
                <div className={ss.professorWrapper}>
                  <div className={ss.avatarCircle}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    name="professor"
                    value={formData.professor}
                    onChange={handleChange}
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
    
    const handleAddClass = (newClass) => {
      setClasses(prev => [...prev, { ...newClass, id: Date.now() }]);
    };
    
    const handleUpdateClass = (id, updatedData) => {
      setClasses(prev => 
        prev.map(item => item.id === id ? { ...item, ...updatedData } : item)
      );
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
              />
            ))}
            <AddClassCard onClick={() => handleAddClass(true)} />
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
                    params_checkbox: scrapeParams.params_checkbox,
                    classes: scrapeParams.classes,
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
                // because the identity/meaning of favorites is tied to the *current* list
                setFavoritedSchedules([]);
            } else {
                 console.error("Scrape returned unexpected data:", result);
                 setScrapeState({ isScraping: false, status: `Error: Received unexpected data from backend.` });
                 setSchedules([[]]);
                 setFavoritedSchedules([]);
            }
        } catch (error) {
            console.error("Scrape invocation failed:", error);
            setScrapeState({ isScraping: false, status: `Scrape failed: ${error.message || 'Unknown error'}` });
            setSchedules([[]]);
            setFavoritedSchedules([]);
        }
    };

    // Toggles the favorite status of a schedule
    // Takes the schedule object, its index, and current status
    const changeFavoriteStatus = async (scheduleData, scheduleIndex, isCurrentlyFavorite) => {
        const scheduleString = stringifySchedule(scheduleData);
        if (scheduleString === null) {
             setError("Failed to process schedule for favoriting.");
             return;
        }

        try {
            await invoke("change_favorite_schedule", {
                id: scheduleIndex,
                isFavorited: isCurrentlyFavorite,
                schedule: scheduleData
            });

            // Change state values
            if (isCurrentlyFavorite) {
                // Remove from favorites
                setFavoritedSchedules(prevFavorites =>
                    prevFavorites.filter(fav => stringifySchedule(fav) !== scheduleString)
                );
            } else {
                // Add to favorites
                setFavoritedSchedules(prevFavorites => [...prevFavorites, scheduleData]);
            }
            console.log(`Updated favorite status for schedule index: ${scheduleIndex} to ${!isCurrentlyFavorite}`);

        } catch (error) {
            console.error("Failed to update favorite status:", error);
            setError(`Failed to update favorite status for schedule ${scheduleIndex + 1}.`);
        }
    }

    const deleteSchedule = async (scheduleIndex, favoriteIndex, isCurrentlyFavorite) => {
        try {
            console.log(scheduleIndex);
            await invoke("delete_schedule", {idSchedule: scheduleIndex, idFavorite: favoriteIndex, isFavorited: isCurrentlyFavorite});
            reset();
        } catch (error) {
            console.error("Failed to update favorite status:", error);
            setError(`Failed to update favorite status for schedule ${scheduleIndex + 1}.`);
        }
    }

    const scheduleMenuClick = async (index) => {
        console.log("Selected schedule index:", index);
        // TODO: Implement logic to display schedules[index]
    }

    if (loading) {
        return (
            <div className={ss['scheduler']}>
                <Sidebar />
                <div className={ss['message-container']}>
                    <div className={ss['message']}>Loading schedule data...</div>
                </div>
            </div>
        );
    }

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