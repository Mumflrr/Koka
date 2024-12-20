import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import "../../App.css";
import "ldrs/grid";
import Sidebar from "../Sidebar/Sidebar";
import ss from "./Scheduler.module.css";

function Scheduler() {
    const [scrapeResult, setScrapeStatus] = useState("");
    const [loadActivitiesResult, setLoadActivitiesStatus] = useState("");
    const [calendarEvents, setCalendarEvents] = useState([]);
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const timeSlots = Array.from({ length: 13 }, (_, i) => `${8 + i}:00`);

    const Dates = ({days, times}) => {
        return {
            days: days,
            times: times
        }

    }

    const Class = ({name, dates, professor, description}) => {
        return {
            name: name,
            dates: dates,
            professor: professor,
            description: description
        }
    }

    const Event = ({name, dates}) => {
        return {
            name: name,
            dates: dates
        }
    }

    useEffect(() => {
        const unsubscribe = listen("scrape_result", (event) => {
            const result = event.payload;
            if (result === null) {
                setScrapeStatus("Scrape completed successfully!");
            } else {
                setScrapeStatus(`Error during scrape: ${result}`);
            }
            setIsScraping(false);
        });
    
        return () => {
            loadActivities();
            unsubscribe.then(f => f());
        };
    }, []);

    async function startScrape() {
        setScrapeStatus("Scraping in progress...");
        try {
          await invoke("scheduler_scrape");
        } catch (error) {
          setScrapeStatus(`Error starting scrape: ${error}`);
        }
    }

    async function loadActivities() {
        setLoadActivitiesStatus("Loading activities...");
        try {
            await invoke("loadActivities");
        } catch (error) {
            setLoadActivitiesStatus(`Error loading activities: ${error}`);
        }
    }

    return (
        <div>
          <Sidebar />
          <div className={ss["scheduler"]}>
            <div className={ss["calendar-container"]}>
              {/* Calendar Header */}
              <div className={ss["calendar-header-container"]}></div>
              {days.map((day) => (
                <div key={day} className={ss["calendar-header-container"]}>
                  <p>{day}</p>
                </div>
              ))}
    
              {/* Time slots */}
              {timeSlots.map((time, index) => (
                <React.Fragment key={index}>
                  <div className={ss["calendar-time-slot"]}>
                    <p className={ss["time-text"]}>{time}</p>
                  </div>
                  {days.map((_, dayIndex) => (
                    <div
                      key={`${time}-${dayIndex}`}
                      className={ss["calendar-cell"]}
                    ></div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      );
}

export default Scheduler;


                {/*
                <l-grid
                    size="100"
                    speed="1.5"
                    color="black" 
                ></l-grid>
                
                */}