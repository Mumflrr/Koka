import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { invoke } from "@tauri-apps/api/tauri";
import Home from './components/Home';
import Courses from './components/Courses/Courses';
import Calendar from './components/Calendar';
import Dining from './components/Dining';
import Gallery from './components/Organisms';
import Settings from './components/Settings';
import Scheduler from './components/Scheduler/Scheduler';
import './App.css';

function App() {

    useEffect(() => {
        const initializeApp = async () => {
            try {
                // 1. Show the splash screen first.
                await invoke("show_splashscreen");
                console.log("Splash screen shown");

                // 2. Wait for the entire backend setup to complete.
                await invoke("startup_app");
                console.log("App startup logic completed successfully.");

                // 3. Only after the backend is ready, close the splash screen.
                await invoke("close_splashscreen");
                console.log("Splash screen closed");
            } catch (error) {
                console.error("Error during app initialization:", error);
                // In case of an error, still try to close the splashscreen
                // to prevent the user from being stuck.
                await invoke("close_splashscreen").catch(console.error);
            }
        };

        initializeApp();
    }, []); // The empty dependency array ensures this runs only once on component mount.

    return (
        <BrowserRouter>
            <Routes>
                <Route path='/' element={<Home />} />
                <Route path='/calendar' element={<Calendar />}/>
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