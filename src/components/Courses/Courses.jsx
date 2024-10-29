import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import "../../App.css";
import Sidebar from "../Sidebar/Sidebar";
import ss from "./Courses.module.css";


function Courses() {

    return (
        <div className = {ss['container']}>
            <Sidebar/>
            <h1 className='page-header'>Courses</h1>
        </div>
    );
}

export default Courses;