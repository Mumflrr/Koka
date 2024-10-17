import { useState, useEffect, useCallback } from "react";
import reactLogo from "../assets/react.svg";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import "../App.css";

function Home() {
    const [isScraping, setIsScraping] = useState(false);
    const [scrapeStatus, setScrapeStatus] = useState("");
    const [isStartupComplete, setIsStartupComplete] = useState(false);

    const showSplashscreen = useCallback(async () => {
        try {
            await invoke("show_splashscreen");
            console.log("Splash screen shown");
        } catch (error) {
            console.error("Failed to show splash screen:", error);
        }
    }, []);

    const startupApp = useCallback(async () => {
        if (isStartupComplete) return; // Prevent duplicate calls
        try {
            await invoke("startup_app");
            console.log("App started successfully");
            setIsStartupComplete(true);
        } catch (error) {
            console.error("Failed to startup app: ", error);
        }
    }, [isStartupComplete]);

    const closeSplashscreen = useCallback(async () => {
        try {
            await invoke("close_splashscreen");
            console.log("Splash screen closed");
        } catch (error) {
            console.error("Failed to close splash screen:", error);
        }
    }, []);

    useEffect(() => {
        const setupListener = async () => {
            const unsubscribe = await listen("scrape_result", (event) => {
                const result = event.payload;
                if (result === null) {
                    setScrapeStatus("Scrape completed successfully!");
                } else {
                    setScrapeStatus(`Error during scrape: ${result}`);
                }
                setIsScraping(false);
            });

            return () => {
                unsubscribe.then((f) => f()); // Unsubscribe when component unmounts
            };
        };

        const initializeApp = async () => {
            await showSplashscreen();
            await startupApp();
            await closeSplashscreen();
            await setupListener();
        };

        initializeApp();
    }, [showSplashscreen, startupApp, closeSplashscreen]);

    const schedulerScrape = async () => {
        setIsScraping(true);
        setScrapeStatus("Scraping in progress...");
        try {
            await invoke("scheduler_scrape");
        } catch (error) {
            setScrapeStatus(`Error starting scrape: ${error}`);
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

        <p>{scrapeStatus}</p>
        </div>
    );
}

    export default Home;