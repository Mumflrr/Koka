import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { NavLink } from 'react-router-dom'
import "../App.css";


export const Sidebar = ({ index }) => {
    const sidebarNames = ["Home", "Calendar", "Food", "Course Management", "Cute Organisms", "Settings"];
    const sidebarNavlinks = ["/", "/calendar", "/dining", "/courses", "/organisms", "/settings"];

    return (
        <div className = "sidebar">
            <h1 className = "title">Index: {index}</h1>

            <div className = "sidebar-items">
{/*                     {sidebarNames.map((item) => (
                        <NavLink to={sidebarNavlinks.at(sidebarNames.indexOf({item}))} className='nav-link'>{item}</NavLink>
                    ))} */}
            </div>
        </div>
    );
};
