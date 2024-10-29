import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import Home from './components/Home';
import Courses from './components/Courses/Courses';
import Calendar from './components/Calendar';
import Dining from './components/Dining';
import Organisms from './components/Organisms';
import Settings from './components/Settings';
import './App.css';

function App() {
    const [isStartupComplete, setIsStartupComplete] = useState(false);

    const showSplashscreen = useCallback( () => {
        try {
            invoke("show_splashscreen");
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
                console.log("Scrape result:", result);
                // You can handle the scrape result here if needed
            });

            return () => {
                unsubscribe.then((f) => f()); // Unsubscribe when component unmounts
            };
        };

        showSplashscreen();
        startupApp();
        closeSplashscreen();
        setupListener();
    }, [showSplashscreen, startupApp, closeSplashscreen]);

    if (!isStartupComplete) {
        return <div>Loading...</div>; // Or your splash screen component
    }

    return (
        <BrowserRouter>
            <Routes>
                <Route path='/' element={<Home />} />
                <Route path='/calendar' element={<Calendar />}/>
                <Route path='/courses' element={<Courses />}/>
                <Route path='/dining' element={<Dining />}/>
                <Route path='/organisms' element={<Organisms />}/>
                <Route path='/settings' element={<Settings />}/>
            </Routes>
        </BrowserRouter>
    );
}

export default App;
