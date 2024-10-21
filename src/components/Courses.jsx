import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import "../App.css";
import { Sidebar } from "./Sidebar";


function Courses() {

    return (
        <>
        <Sidebar index={0} />
        <h1 className="page-header">Plover</h1>
        </>
    );
}

export default Courses;