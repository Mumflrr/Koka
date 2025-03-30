import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import "../../App.css";
import Sidebar from "../Sidebar/Sidebar";
import ss from "./Courses.module.css";


function Courses() {

    return (
        <div>
            <Sidebar/>
            <div className = {ss['courses']}>
                <h1 className='page-header'>Courses</h1>
            </div>

        </div>
    );
}

export default Courses;