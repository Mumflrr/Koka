// Scheduler.js
import React, { useState, useEffect } from 'react';
import { invoke } from "@tauri-apps/api/tauri";
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
    const [classes, setClasses] = useState([]);

    useEffect(() => {
        setParams([true, false, true]);
        loadEvents();
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
        setIsScraping(true);
        try {
            await invoke("scheduler_scrape", {params: params, classes: classes});
        } catch (error) {
            setScrapeStatus(`Error starting scrape: ${error}`);
        } finally {
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
        <div className={ss['calendar-wrapper']}>
        <CalendarGrid 
            events={events} 
            onEventCreate={handleCreateEvent}
            onEventDelete={handleDeleteEvent}
            />
        </div>
        <button onClick={schedulerScrape} disabled={isScraping}>
                        {isScraping ? "Scraping..." : "Start Scrape"}
        </button>

        <p>{scrapeStatus}</p>
        </div>
    );
};

export default Scheduler;