import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import "../../App.css";
import Sidebar from "../Sidebar/Sidebar";
import ss from "./Courses.module.css";


function Courses() {
    const [scrapeResult, setScrapeStatus] = useState("");

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

    return (
        <div>
            <Sidebar/>
            <div className = {ss['courses']}>
                <h1 className='page-header'>Courses</h1>
            </div>

        </div>
    );
}

export default Courses;