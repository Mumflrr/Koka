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
            <h1>Welcome to Tauri!</h1>

            <div className="row">
                <a href="https://vitejs.dev" target="_blank">
                    <img src="/vite.svg" className="logo vite" alt="Vite logo" />
                </a>
                <a href="https://tauri.app" target="_blank">
                    <img src="/tauri.svg" className="logo tauri" alt="Tauri logo" />
                </a>
                <a href="https://reactjs.org" target="_blank">
                    <img src={reactLogo} className="logo react" alt="React logo" />
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