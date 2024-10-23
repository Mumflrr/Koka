import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Calendar, Utensils, BookOpen, Squirrel, Settings } from "lucide-react";
import ss from "./Sidebar.module.css";

// Reusable sidebar item component with fixed CSS module classes
const SidebarItem = ({ icon: Icon, label, to }) => {
  return (
    <NavLink 
      to={to}
      className={({ isActive }) => `${ss['sidebar-item']} ${isActive ? ss.active : ''}`}>
      <Icon className={ss['sidebar-icon']} />
      <span className={ss['sidebar-label']}>{label}</span>
    </NavLink>
  );
};

function Sidebar() {
    const sidebarItems = [
        { icon: LayoutDashboard, label: "Home", path: "/" },
        { icon: Calendar, label: "Calendar", path: "/calendar" },
        { icon: Utensils, label: "Food", path: "/dining" },
        { icon: BookOpen, label: "Courses", path: "/courses" },
        { icon: Squirrel, label: "Cute Organisms", path: "/organisms" },
    ];

    return (
        <aside className={ss['sidebar']}>
            <div className={ss['sidebar-header']}>
                <span className={ss['sidebar-logo']}><img src="/plover-stencil.svg" className='logo plover' alt="Plover 'logo'" /></span>
                <span className={ss['sidebar-title']}>Plover</span>
            </div>

            <nav className={ss['sidebar-nav']}>
                {sidebarItems.map((item) => (
                    <SidebarItem
                        key={item.path}
                        icon={item.icon}
                        label={item.label}
                        to={item.path}
                    />
                ))}
            </nav>

            <div className={ss['sidebar-footer']}>
                <button className={ss['settings-button']}>
                    <Settings className={ss['sidebar-icon']} />
                    <span className={ss['sidebar-label']}>Settings</span>
                </button>
            </div>
        </aside>
    );
}

export default Sidebar;