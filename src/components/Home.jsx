import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import reactLogo from "../assets/react.svg";
import "../App.css";

function Home() {
    const [isScraping, setIsScraping] = useState(false);

    const schedulerScrape = async () => {
        setIsScraping(true);
        try {
            await invoke("scheduler_scrape");
        } catch (error) {
            console.error(`Error starting scrape: ${error}`);
        } finally {
            setIsScraping(false);
        }
    };

    return (
        <div className="container">
            <h1>Welcome to Plover!</h1>

            <div className="row">
                <a href="https://github.com/Mumflrr/Plover/tree/main" target="_blank">
                    <img src="/plover-stencil.svg" className="logo plover" alt="Plover 'logo'" />
                </a>
            </div>

            <p>Click on the Tauri, Vite, and React logos to learn more.</p>

            <div className="row">
                <button onClick={schedulerScrape} disabled={isScraping}>
                    {isScraping ? "Scraping..." : "Start Scrape"}
                </button>
            </div>
        </div>
    );
}

export default Home;