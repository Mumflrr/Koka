import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider } from './components/Sidebar/SidebarContext';
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import Home from './components/Home';
import Courses from './components/Courses/Courses';
import Calendar from './components/Calendar';
import Dining from './components/Dining';
import Gallery from './components/Organisms';
import Settings from './components/Settings';
import Scheduler from './components/Scheduler/Scheduler';
import './App.css';

function App() {

    const showSplashscreen = useCallback( () => {
        try {
            invoke("show_splashscreen");
            console.log("Splash screen shown");
        } catch (error) {
            console.error("Failed to show splash screen:", error);
        }
    }, []);

    const startupApp = useCallback(async () => {
        try {
            await invoke("startup_app");
            console.log("App started successfully");
        } catch (error) {
            console.error("Failed to startup app: ", error);
        }
    }, []);

    const closeSplashscreen = useCallback(async () => {
        try {
            await invoke("close_splashscreen");
            console.log("Splash screen closed");
        } catch (error) {
            console.error("Failed to close splash screen:", error);
        }
    }, []);

    useEffect(() => {
        showSplashscreen();
        startupApp();
        closeSplashscreen();
    }, [showSplashscreen, startupApp, closeSplashscreen]);

    return (
        <SidebarProvider>
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
        </SidebarProvider>
    );
}

export default App;
