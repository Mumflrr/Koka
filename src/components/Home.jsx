import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { NavLink } from 'react-router-dom'
import "../App.css";

function Home() {
    const [isScraping, setIsScraping] = useState(false);
    const [scrapeStatus, setScrapeStatus] = useState("");

    const schedulerScrape = async () => {
        setIsScraping(true);
        try {
            await invoke("scheduler_scrape");
        } catch (error) {
            setScrapeStatus(`Error starting scrape: ${error}`);
        } finally {
            setIsScraping(false);
        }
    };

    return (
        <div className="container">
            <h1>Welcome to Plover!</h1>

            <a href="https://github.com/Mumflrr/Plover/tree/main" target="_blank">
                <img src="/plover-stencil.svg" className="logo plover" alt="Plover 'logo'" />
            </a>

            <p>Click on the Plover logo to learn more.</p>

            <div className="row">
                <button onClick={schedulerScrape} disabled={isScraping}>
                    {isScraping ? "Scraping..." : "Start Scrape"}
                </button>

                <NavLink to='/courses' className='nav-link'>Courses</NavLink>
            </div>

            <p>{scrapeStatus}</p>
        </div>
    );
}

export default Home;