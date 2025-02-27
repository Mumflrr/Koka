// Scheduler.js
import React, { useState, useEffect } from 'react';
import { invoke } from "@tauri-apps/api/tauri";
import { parse } from 'date-fns';
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
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const loadedEvents = await invoke('get_events_frontend');
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
      await invoke('create_event_frontend', { event: eventToSave });
      setEvents(prevEvents => {
        const updatedEvents = [...prevEvents, eventToSave];
        return processEvents(updatedEvents);
      });
    } catch (err) {
      console.error('Error saving event:', err);
      alert('Failed to save event. Please try again.');
    }
  };

  const handleDeleteEvent = (eventId) => {
    setEvents(prevEvents => {
      const updatedEvents = prevEvents.filter(e => e.id !== eventId);
      return processEvents(updatedEvents);
    });
  };


   const processEvents = (rawEvents) => {
    if (!rawEvents || rawEvents.length === 0) return [];
    
    const parseTime = (timeStr) => parse(timeStr, 'HH:mm', new Date());
    
    const eventsByDay = rawEvents.reduce((acc, event) => {
      acc[event.day] = acc[event.day] || [];
      acc[event.day].push(event);
      return acc;
    }, {});
  
    Object.keys(eventsByDay).forEach(day => {
      const dayEvents = eventsByDay[day];
      
      dayEvents.sort((a, b) => {
        const timeA = parseTime(a.startTime);
        const timeB = parseTime(b.startTime);
        return timeA.getTime() - timeB.getTime();
      });
  
      let currentGroup = [];
      let groups = [];
      
      dayEvents.forEach((event) => {
        const eventStart = parseTime(event.startTime);
        const overlapsWithGroup = currentGroup.some(groupEvent => {
          const groupEventEnd = parseTime(groupEvent.endTime);
          return eventStart < groupEventEnd;
        });
  
        if (overlapsWithGroup) {
          currentGroup.push(event);
        } else {
          if (currentGroup.length > 0) {
            groups.push([...currentGroup]);
          }
          currentGroup = [event];
        }
      });
  
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
  
      groups.forEach(group => {
        const groupWidth = 100;
        const eventWidth = groupWidth / group.length;
        
        group.forEach((event, index) => {
          event.width = `${eventWidth}%`;
          event.left = `${index * eventWidth}%`;
        });
      });
  
      dayEvents.forEach(event => {
        if (!event.width) {
          event.width = '100%';
          event.left = '0%';
        }
      });
    });
  
    return rawEvents;
  };

  const schedulerScrape = async () => {
    setIsScraping(true);
    try {
        await invoke("scheduler_scrape", {params: 'ovare', classes: 'teste'});
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