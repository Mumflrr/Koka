import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import "../App.css";
import Sidebar from "./Sidebar/Sidebar";


function Calendar() {

    return (
        <>
        <Sidebar/>
        <h1 className='page-header'>Calender</h1>
        </>
    );
}

export default Calendar;