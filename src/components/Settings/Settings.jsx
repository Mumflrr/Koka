import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import "../../App.css";
import Sidebar from "../Sidebar/Sidebar";


function Settings() {

    return (
        <>
        <Sidebar/>
        <h1 className="page-header">Settings</h1>
        </>
    );
}

export default Settings;