// Scheduler.js
import React, { useState, useEffect, useMemo } from 'react'; // Import useMemo
import { invoke } from "@tauri-apps/api/tauri";
import processEvents from '../CalendarGrid/processEvents';
import CalendarGrid from '../CalendarGrid/CalendarGrid';
import Sidebar from "../Sidebar/Sidebar";
import ss from './Scheduler.module.css';

// Helper function to consistently stringify a schedule
// NOTE: Assumes schedule is JSON-serializable and order is consistent or doesn't matter.
// If order matters but isn't guaranteed, you'd need a more complex function
// to sort properties/elements before stringifying.
const stringifySchedule = (schedule) => {
    try {
        // Simple stringify, good for arrays of primitives or consistent objects
        return JSON.stringify(schedule);
        // Example for sorting if schedule is an array of objects with an 'id':
        // return JSON.stringify([...schedule].sort((a, b) => a.id.localeCompare(b.id)));
    } catch (e) {
        console.error("Failed to stringify schedule:", schedule, e);
        return null; // Handle error case
    }
};


// TODO Responsiveness
// TODO add a remove button for individual schedules
// TODO add button to cache certain classes even if not in list
// TODO work on favorited schedules - Currently using stringified Set for lookup
// TODO add disclaimer if there are classes in shopping cart will change scrape results if
//      'only show classes that fit in schedule' is true
// TODO fix deleting one block of multi-day event not deleting all blocks
// TODO how to handle partial professor names

const Scheduler = () => {
    // Core state
    const [events, setEvents] = useState([]);
    const [schedules, setSchedules] = useState([[]]); // Array of generated schedule objects/arrays
    const [classes, setClasses] = useState([[]]);

    // UI State
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [renderFavorites, setRenderFavorites] = useState(false);

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
    const [scrapeParams, setScrapeParams] = useState({
        params_checkbox: [false, false, false],
        classes: [
            { code: "CSC", name: "116", section: "", instructor: "" },
            { code: "BIO", name: "181", section: "", instructor: "" }
        ],
        events: [ ]
    });

    useEffect(() => {
        loadPage();
        return () => { };
    }, []);

    const loadPage = async() => {
        //TODO make the load go into the Store.jsx
       try {
            setLoading(true);
            setError(null);

            const loadedEvents = await invoke('get_events', {table: "scheduler"});
            setEvents(processEvents(loadedEvents || []));

            //TODO load classes

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
             } else {
                 console.warn("Loaded schedules is not a non-empty array:", loadedSchedules);
                 setSchedules([[]]); // Default placeholder
             }

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


{/*<!-----------------------------------End Setup Functions-----------------------------------!> */}
{/*<!----------------------------------Start Render Functions---------------------------------!> */}
    const renderScrollbar = () => {
        const hasSchedules = schedules.length > 0 && schedules[0].length > 0;

        if (!hasSchedules) {
            return (
                <div className={ss['scrollbar-wrapper']}>
                    <div className={ss['empty-message']}>No schedules generated yet.</div>
                </div>
            );
        }

        if (renderFavorites) {
            return (
                <div className={ss['scrollbar-wrapper']}>
                {favoritedSchedules.map((schedule, i) => {
                    return (
                        <div key={i}
                            className={ss['item-slot']}
                            onClick={() => scheduleMenuClick(i)}
                        >
                            <button
                                className={`${ss['favorite-button']} ${ss['favorited']}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    // Pass the actual schedule object and its index
                                    changeFavoriteStatus(schedule, favoriteIndex, isFavorite);
                                }}
                                aria-label={`Unfavorite Schedule ${i + 1}`}
                            >
                                {'★'}
                            </button>
                            <p>Schedule {i + 1}</p>
                        </div>
                    );
                })}
            </div>
            )
        }

        return (
            <div className={ss['scrollbar-wrapper']}>
                {schedules.map((schedule, i) => {
                    // Stringify the current schedule being rendered
                    const currentScheduleString = stringifySchedule(schedule);

                    // Check if its string representation exists in the Set of favorite strings
                    const isFavorite = currentScheduleString !== null && favoritedScheduleStrings.has(currentScheduleString);
                    // Find the index in favoritedScheduleStrings if it's a favorite
                    let favoriteIndex = -1;
                    if (isFavorite && currentScheduleString !== null) {
                        // Convert Set to Array to find the index
                        const favoritesArray = Array.from(favoritedScheduleStrings);
                        favoriteIndex = favoritesArray.indexOf(currentScheduleString);
                    }

                    return (
                        <div key={i}
                            className={ss['item-slot']}
                            onClick={() => scheduleMenuClick(i)}
                        >
                            <button
                                className={`${ss['favorite-button']} ${isFavorite ? ss['favorited'] : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    // Pass the actual schedule object and its index
                                    changeFavoriteStatus(schedule, favoriteIndex, isFavorite);
                                }}
                                aria-label={isFavorite ? `Unfavorite Schedule ${i + 1}` : `Favorite Schedule ${i + 1}`}
                            >
                                {isFavorite ? '★' : '☆'}
                            </button>
                            <p>Schedule {i + 1}</p>
                        </div>
                    );
                })}
            </div>
        );
    }

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
                scheduleIndex,
                isCurrentlyFavorite,
                scheduleData
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

    const scheduleMenuClick = (index) => {
        console.log("Selected schedule index:", index);
        // TODO: Implement logic to display schedules[index]
    }

    if (loading) {
        // ... loading indicator ...
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
            </div>
        </div>
    );
};

export default Scheduler;