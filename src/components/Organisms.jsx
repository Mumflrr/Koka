import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import "../App.css";
import Sidebar from "./Sidebar/Sidebar";


function Organisms() {

    return (
        <>
        <Sidebar/>
        <h1 className='page-header'>Organisms</h1>
        </>
    );
}

export default Organisms;