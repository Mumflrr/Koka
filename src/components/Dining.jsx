import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import "../App.css";
import Sidebar from "./Sidebar/Sidebar";


function Dining() {

    return (
        <>
        <Sidebar/>
        <h1 className='page-header'>Food</h1>
        </>
    );
}

export default Dining;