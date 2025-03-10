// Scheduler.js
import React, { useState, useEffect } from 'react';
import { invoke } from "@tauri-apps/api/tauri";
import { listen} from "@tauri-apps/api/event";
import processEvents from '../CalendarGrid/processEvents';
import CalendarGrid from '../CalendarGrid/CalendarGrid';
import Sidebar from "../Sidebar/Sidebar";
import ss from './Scheduler.module.css';


const Scheduler = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isScraping, setIsScraping] = useState(false);
    const [scrapeStatus, setScrapeStatus] = useState("");
    const [params, setParams] = useState([]);
    const [classesToScrape, setClassesToScrape] = useState([]);
    const [scrapedClasses, setScrapedClasses] = useState([[]]);

    useEffect(() => {
        setClassesToScrape([["CSC", "116", "", [[-1, -1]], [], ""], ["CSC", "246", "", [[-1, -1]], [], "Sturgill"], ["MA", "341", "", [[-1, -1]], [], ""]]);
        setParams([false, false, false]);
        loadEvents();

        // Set up event listener for scrape results
        const unlisten = listen('scrape_result', (event) => {
            setIsScraping(false);
            
            // Check if the payload is an error message (string) or success (empty)
            if (event.payload && typeof event.payload === 'string') {
                console.error("Scrape error:", event.payload);
                setScrapeStatus(`Error: ${event.payload}`);
                setError(`Scrape failed: ${event.payload}`);
            } else {
                console.log("Scrape completed successfully");
                setScrapeStatus("Scrape completed successfully!");
                setError(null);
            }
        });
        
        // Clean up listener when component unmounts
        return () => {
            unlisten.then(unlistenFn => unlistenFn());
        };
    }, []);

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
            const eventToSave = {
                ...newEvent,
                id: Math.max(...events.map(e => e.id), 0) + 1
            };
            await invoke('create_event', { event: eventToSave, eventType: "Scheduler" });
            setEvents(prevEvents => {
                const updatedEvents = [...prevEvents, eventToSave];
                return processEvents(updatedEvents);
            });
        } catch (err) {
            console.error('Error saving event:', err);
            alert('Failed to save event. Please try again.');
        }
    };

    const handleDeleteEvent = async (eventId) => {
        await invoke('delete_event', { eventId: eventId, eventType: "Scheduler" });
        setEvents(prevEvents => {
            return prevEvents.filter(e => e.id !== eventId);
        });
    };

    const schedulerScrape = async () => {
        // Reset states
        setError(null);
        setIsScraping(true);
        setScrapeStatus("Starting scrape... This may take a while.");
        
        try {
            // Call the Rust function to start the scraping process
            // Note: This will return immediately while scraping continues in the background
            await invoke("scheduler_scrape", {
                params: params, 
                classes: classesToScrape
            });
            
            // Don't update states here as the operation is continuing in the background
            // Results will come via the event listener
        } catch (error) {
            // This will only catch errors that happen during the initial invocation
            // not errors during the scraping process
            console.error("Failed to start scrape:", error);
            setScrapeStatus(`Failed to start scrape: ${error}`);
            setError(`Failed to start scrape: ${error}`);
            setIsScraping(false);
        }
    };

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

    if (error) {
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
            
            <div className={ss['calendar-wrapper']}>
                <CalendarGrid 
                    events={events} 
                    onEventCreate={handleCreateEvent}
                    onEventDelete={handleDeleteEvent}
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
                
                {scrapeStatus && (
                    <div className={`${ss['status-message']} ${scrapeStatus.includes("Error") ? ss['status-error'] : ss['status-success']}`}>
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