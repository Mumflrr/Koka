import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import "../../App.css";
import Sidebar from "../Sidebar/Sidebar";
import ss from "./Courses.module.css";


function Courses() {
    return (
        <div>
            <Sidebar/>
            <div className = {ss['courses']}>
                <h1 className='page-header'>Courses</h1>
                <button onClick={() => invoke('scheduler_scrape')}>
                CLICK ME
                </button>
            </div>

        </div>
    );
}

export default Courses;