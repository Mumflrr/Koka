// Scheduler.js
import React, { useState, useEffect, useRef } from 'react';
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import processEvents from '../CalendarGrid/processEvents';
import CalendarGrid from '../CalendarGrid/CalendarGrid';
import Sidebar from "../Sidebar/Sidebar";
import ss from './Scheduler.module.css';

const Scheduler = () => {
    // Core state
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // UI state
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);
    
    // Scraping state - consolidated into objects for better organization
    const [scrapeState, setScrapeState] = useState({
        isScraping: false,
        status: "",
        scrapedClasses: [[]]
    });
    
    // Extract values from scrapeState (moved after definition)
    const { isScraping, status: scrapeStatus, scrapedClasses } = scrapeState;
    
    // Parameters state - consolidated into a single object
    const [scrapeParams, setScrapeParams] = useState({
        checkBoxes: [false, false, false],
        classes: [["CSC", "116", "", ""], ["BIO", "181", "", ""]],
        events: [[[800, 829], [true, false, false, false, false]]]
    });

    useEffect(() => {
        loadEvents();
        const cleanupFunctions = [
            setupScrapeListener(),
            setupClickOutsideListener()
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

    // Setup listeners in separate functions for better organization
    const setupScrapeListener = () => {
        const unlistenPromise = listen('scrape_result', (event) => {
            if (event.payload && typeof event.payload === 'string') {
                console.error("Scrape error:", event.payload);
                setScrapeState(prev => ({
                    ...prev,
                    isScraping: false,
                    status: `Error: ${event.payload}`
                }));
            } else {
                setScrapeState(prev => ({
                    ...prev,
                    isScraping: false,
                    status: "Scrape completed successfully!",
                    scrapedClasses: event.payload
                }));
                console.log(event.payload);
            }
        });
        
        return () => unlistenPromise.then(unlistenFn => unlistenFn());
    };

    const setupClickOutsideListener = () => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setDropdownOpen(false);
            }
        };
        
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    };

    const loadEvents = async () => {
        try {
            setLoading(true);
            setError(null);
            const loadedEvents = await invoke('get_events', {eventType: "Scheduler"});
            const processedEvents = processEvents(loadedEvents);
            setEvents(processedEvents);
        } catch (err) {
            console.error('Error loading events:', err);
            setError('Failed to load events. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateEvent = async (newEvent) => {
        try {
            // Create a truly unique ID using timestamp and random string
            const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            const eventToSave = {
                ...newEvent,
                id: uniqueId
            };
            
            await invoke('create_event', { event: eventToSave, eventType: "Scheduler" });
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
            await invoke('delete_event', { eventId, eventType: "Scheduler" });
            setEvents(prevEvents => prevEvents.filter(e => e.id !== eventId));
        } catch (err) {
            console.error('Error deleting event:', err);
            setError('Failed to delete event. Please try again.');
        }
    };

    // Add missing update event handler for consistency
    const handleUpdateEvent = async (updatedEvent) => {
        try {
            await invoke('update_event', { event: updatedEvent, eventType: "Scheduler" });
            setEvents(prevEvents => {
                const filtered = prevEvents.filter(e => e.id !== updatedEvent.id);
                return processEvents([...filtered, updatedEvent]);
            });
        } catch (err) {
            console.error('Error updating event:', err);
            setError('Failed to update event. Please try again.');
        }
    };

    const schedulerScrape = async () => {
        setScrapeState(prev => ({
            ...prev,
            isScraping: true,
            status: "Starting scrape... This may take a while."
        }));
        
        try {
            await invoke("scheduler_scrape", {
                parameters: [
                    scrapeParams.checkBoxes, 
                    scrapeParams.classes, 
                    scrapeParams.events
                ]
            });
        } catch (error) {
            console.error("Failed to start scrape:", error);
            setScrapeState(prev => ({
                ...prev,
                isScraping: false,
                status: `Failed to start scrape: ${error}`
            }));
        }
    };

    // Toggle dropdown menu
    const toggleDropdown = (e) => {
        e.stopPropagation();
        setDropdownOpen(prevState => !prevState);
    };

    // Handle link clicks in dropdown - updated to match usage in renderDropdownButtons
    const handleLinkClick = (e, index) => {
        e.preventDefault();
        console.log(`Schedule selected: ${index}`);
        setDropdownOpen(false);
        
        // Add your logic for handling the selected schedule here
    };

    // Generate dropdown buttons based on scrapedClasses length
    const renderDropdownButtons = () => {
        // If scrapedClasses is empty or not an array, return a default message
        if (!Array.isArray(scrapedClasses) || scrapedClasses.length === 1) {
            return (
                <div className={ss['dropdown-item-message']}>
                    No schedules
                </div>
            );
        }

        // Otherwise, create a button for each class
        return scrapedClasses.map((classData, index) => {
            return (
                <button 
                    key={`class-${index}`}
                    onClick={(e) => handleLinkClick(e, index)}
                    className={ss['dropdown-item']}
                >
                    {`Schedule- ${index + 1}`}
                </button>
            );
        });
    };

    // If we're loading events, show loading state
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
                <div className={ss['scheduler-top-bar']}>
                    <div className={ss['scheduler-top-bar-dropdown']} ref={dropdownRef}>
                        <button 
                            onClick={toggleDropdown} 
                            className={ss['dropbtn']}
                            aria-haspopup="true"
                            aria-expanded={dropdownOpen}
                        >
                            Options ▼
                        </button>
                        {dropdownOpen && (
                            <div className={ss['dropdown-content']}>
                                {renderDropdownButtons()}
                            </div>
                        )}
                    </div>
                    <div className={ss['scheduler-top-bar-text']}>
                        <p>Placeholder</p>
                    </div>
                </div>
                <CalendarGrid 
                    events={events} 
                    onEventCreate={handleCreateEvent}
                    onEventDelete={handleDeleteEvent}
                    onEventUpdate={handleUpdateEvent}
                />
            </div>
            
            <div className={ss['scrape-container']}>
                <button 
                    className={`${ss.button} ${ss['button-primary']}`}
                    onClick={schedulerScrape} 
                    disabled={isScraping}
                >
                    {isScraping ? "Scraping..." : "Start Scrape"}
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