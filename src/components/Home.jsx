import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { NavLink } from 'react-router-dom'
import "../App.css";
import Sidebar from "./Sidebar/Sidebar";

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
        <div className='container'>
            <Sidebar/>
            <h1>Welcome to Plover!</h1>
        </div>
    );
}

export default Home;