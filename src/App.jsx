import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { systemAPI } from './api';
import Home from './components/Home/Home';
import Courses from './components/Courses/Courses';
import Dining from './components/Dining/Dining';
import Gallery from './components/Gallery/Gallery';
import Settings from './components/Settings/Settings';
import Scheduler from './components/Scheduler/Scheduler';
import './App.css';

function App() {

    // FIXME: Make waiting actually work
    useEffect(() => {
        const initializeApp = async () => {
            try {
                // 1. Show the splash screen first.
                await systemAPI.showSplashscreen();
                console.log("Splash screen shown");

                // 2. Wait for the entire backend setup to complete.
                await systemAPI.startupApp();
                console.log("App startup logic completed successfully.");

                // 3. Only after the backend is ready, close the splash screen.
                await systemAPI.closeSplashscreen();
                console.log("Splash screen closed");
            } catch (error) {
                console.error("Error during app initialization:", error);
                // In case of an error, still try to close the splashscreen
                // to prevent the user from being stuck.
                try {
                    await systemAPI.closeSplashscreen();
                } catch (closeError) {
                    console.error("Failed to close splashscreen:", closeError);
                }
            }
        };

        initializeApp();
    }, []); // The empty dependency array ensures this runs only once on component mount.

    return (
        <BrowserRouter>
            <Routes>
                <Route path='/' element={<Home />} />
                <Route path='/courses' element={<Courses />}/>
                <Route path='/dining' element={<Dining />}/>
                <Route path='/gallery' element={<Gallery />}/>
                <Route path='/settings' element={<Settings />}/>
                <Route path='/scheduler' element={<Scheduler />}/>
            </Routes>
        </BrowserRouter>
    );
}

export default App;