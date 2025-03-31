// Scheduler.js
import React, { useState, useEffect } from 'react';
import { invoke } from "@tauri-apps/api/tauri";
import processEvents from '../CalendarGrid/processEvents';
import CalendarGrid from '../CalendarGrid/CalendarGrid';
import Sidebar from "../Sidebar/Sidebar";
import ss from './Scheduler.module.css';

// TODO Responsiveness
// TODO Fix top bar not shadowing on modal opening
// TODO add a remove button for individual schedules
// TODO add button to cache certain classes even if not in list
// TODO add button to re-scrape classes in list
// TODO work on favorited schedules
// TODO add disclaimer if there are classes in shopping cart will change scrape results if 
//      'only show classes that fit in schedule' is true
// TODO fix deleting one block of multi-day event not deleting all blocks

const Scheduler = () => {
    // Core state
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [schedules, setSchedules] = useState([[]]);
    const [favoritedSchedules, setFavoritedSchedules] = useState(new Set());
    
    // UI state
    const [numSchedules, setNumSchedules] = useState(0);
    const [numClasses, setNumClasses] = useState(0);

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
            { code: "BIO", name: "181", section: "", instructor: "me" }
        ],
        events: [
            { time: [800, 829], days: [true, false, false, false, false] }
        ]
    });

    useEffect(() => {
        loadPage();
        const cleanupFunctions = [
            // If I have listener functions put them here
        ];
        
        // Return a cleanup function that calls all cleanup functions
        return () => {
            cleanupFunctions.forEach(cleanup => {
                if (typeof cleanup === 'function') {
                    cleanup();
                } else if (cleanup && typeof cleanup.then === 'function') {
                    cleanup.then(fn => typeof fn === 'function' && fn());
                }
            });
        };
    }, []);

    const loadPage = async() => {
       try {
            setLoading(true);
            setError(null);
            const loadedEvents = await invoke('get_events', {table: "scheduler"});
            setEvents(processEvents(loadedEvents));
            // TODO Load classes
            // TODO Load schedules (including favorites)
            setLoading(false);
       } catch (err) {
            console.error('Error loading events:', err);
            setError('Failed to load events. Please try again later.');
        } finally {
            setLoading(false);
        }
    }


{/*<!-----------------------------------End Setup Functions-----------------------------------!> */}
{/*<!----------------------------------Start Render Functions---------------------------------!> */}
    const renderScrollbar = () => {
        // If items is empty or undefined, render nothing or a placeholder
        if (!numSchedules || numSchedules === 0) {
            return (
                <div className={ss['scrollbar-wrapper']}>
                    <div className={ss['empty-message']}>No schedules</div>
                </div>
            );
        }
    
        return (
            <div className={ss['scrollbar-wrapper']}>
                {Array.from({length: numSchedules}).map((_, i) => (
                    <div key = {i} 
                        className={i === 0 ? ss['item-slot'] : ss['item-slot-first']}
                        onClick={() => scheduleMenuClick(i)}
                    >
                        <button 
                        className={`${ss['favorite-button']} ${favoritedSchedules.has(i) ? ss['favorited'] : ''}`} 
                        onClick={(e) => {
                            e.stopPropagation();
                            favoriteSchedule(i);
                        }}
                        >
                        {favoritedSchedules.has(i) ? '★' : '☆'}
                    </button>
                        <p>Schedule {i + 1}</p>
                    </div>
                ))}
            </div>
        );
    }

{/*<!-----------------------------------End Render Functions----------------------------------!> */}
{/*<!---------------------------------Start Runtime Functions---------------------------------!> */}

    const handleCreateEvent = async (newEvent) => {
        try {
            // Create a truly unique ID using timestamp and random string
            const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            const eventToSave = {
                ...newEvent,
                id: uniqueId
            };
            
            await invoke('create_event', { event: eventToSave, table: "scheduler" });
            setEvents(prevEvents => {
                const updatedEvents = [...prevEvents, eventToSave];
                return processEvents(updatedEvents);
            });
        } catch (err) {
            console.error('Error saving event:', err);
            setError('Failed to save event. Please try again.');
        }
    };

    const handleDeleteEvent = async (eventId) => {
        try {
            await invoke('delete_event', { eventId, table: "scheduler" });
            setEvents(prevEvents => prevEvents.filter(e => e.id !== eventId));
        } catch (err) {
            console.error('Error deleting event:', err);
            setError('Failed to delete event. Please try again.');
        }
    };

    const handleUpdateEvent = async (updatedEvent) => {
        try {
            await invoke('update_event', { event: updatedEvent, table: "scheduler" });
            setEvents(prevEvents => {
                const filtered = prevEvents.filter(e => e.id !== updatedEvent.id);
                return processEvents([...filtered, updatedEvent]);
            });
        } catch (err) {
            console.error('Error updating event:', err);
            setError('Failed to update event. Please try again.');
        }
    };

    const generateSchedules = async () => {
        setScrapeState(prev => ({
            ...prev,
            isScraping: true,
            status: "Starting scrape... This may take a while."
        }));
    
        try {
            const result = await invoke("generate_schedules", {
                parameters: {
                    params_checkbox: scrapeParams.params_checkbox,
                    classes: scrapeParams.classes,
                    events: scrapeParams.events
                }
            });

            if (typeof result === 'string') {
                console.error("Scrape error:", result);
                setScrapeState(prev => ({
                    ...prev,
                    isScraping: false,
                    status: `Error: ${result}`
                }));
            }
            else {
                console.log("Scrape successful:", result);
                setNumSchedules(result.length || 0);
                setScrapeState(prev => ({
                    ...prev,
                    isScraping: false,
                    status: `Scrape completed, found ${result.length} schedules`
                }));
                setSchedules(result);
            }
        } catch (error) {
            console.error("Scrape failed:", error);
            setScrapeState(prev => ({
                ...prev,
                isScraping: false,
                status: `Scrape failed: ${error}`
            }));
        }
    };

    const favoriteSchedule = (scheduleIndex) => {
        setFavoritedSchedules(prevFavorites => {
            const newFavorites = new Set(prevFavorites);
            if (newFavorites.has(scheduleIndex)) {
                newFavorites.delete(scheduleIndex);
            } else {
                newFavorites.add(scheduleIndex);
            }
            return newFavorites;
        });
    }

    const scheduleMenuClick = () => {

    }

    // If we're loading something, show loading state
    if (loading) {
        return (
            <div className={ss['scheduler']}>
                <Sidebar />
                <div className={ss['message-container']}>
                    <div className={ss['message']}>Loading events...</div>
                </div>
            </div>
        );
    }

    // If there's a critical error that prevents the app from functioning
    if (error && !events.length) {
        return (
            <div className={ss['scheduler']}>
                <Sidebar />
                <div className={ss['message-container']}>
                    <div className={ss['message']}>{error}</div>
                    <button 
                        className={`${ss.button} ${ss['button-primary']}`}
                        onClick={loadEvents}
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={ss['scheduler']}>
            <Sidebar />
            
            {/* Show non-critical errors as dismissable notifications */}
            {error && (
                <div className={ss['error-container']}>
                    <div className={ss['error-message']}>{error}</div>
                    <button 
                        className={`${ss.button} ${ss['button-secondary']}`}
                        onClick={() => setError(null)}
                    >
                        Dismiss
                    </button>
                </div>
            )}
            
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
