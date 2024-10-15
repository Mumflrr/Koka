import { useState, useEffect } from "react";
import reactLogo from "../assets/react.svg";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import "../App.css";

function Home() {  // Changed from App to Home

  useEffect(() => {
    // Function to close the splash screen
    const closeSplashscreen = async () => {
      try {
        const response = await invoke("close_splashscreen");
        setCloseStatus(response);
      } catch (error) {
        console.error("Failed to close splash screen:", error);
        setCloseStatus(`Error closing splash screen: ${error}`);
      }
    };

    // Listen for the scrape_result event
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

    setupListener();

    // Call the function to close the splash screen
    closeSplashscreen();
  }, []);

  async function close_splashscreen() {
    setCloseStatus(await invoke("close_splashscreen"));
  }

  async function schedulerScrape() {
    setIsScraping(true);
    setScrapeStatus("Scraping in progress...");
    try {
      await invoke("scheduler_scrape");
    } catch (error) {
      setScrapeStatus(`Error starting scrape: ${error}`);
      setIsScraping(false);
    }
  }

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

    </div>
  );
}

export default Home;