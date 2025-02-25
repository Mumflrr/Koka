import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Calendar, Utensils, Presentation, SearchIcon, Squirrel} from "lucide-react";
import useStore from '../Store.jsx';
import { shallow } from 'zustand/shallow'
import ss from "./Sidebar.module.css";

const SidebarItem = ({ icon: Icon, label, to }) => {
  return (

    <NavLink 
      to={to}
      className={({ isActive }) => `${ss['sidebar-item']} ${isActive ? ss.active : ''}`}>
      <span className={ss['sidebar-item-bar']}></span>
      <Icon className={ss['sidebar-item-icon']} />
      <span className={ss['sidebar-item-label']}>{label}</span>
    </NavLink>
  );
};

function Sidebar() {
    const isExpanded = useStore(state => state.isExpanded)
    const setIsExpanded = useStore(state => state.setIsExpanded)
    
    const sidebarItems = [
        { icon: LayoutDashboard, label: "Home", path: "/" },
        { icon: Calendar, label: "Calendar", path: "/calendar" },
        { icon: Utensils, label: "Food", path: "/dining" },
        { icon: Presentation, label: "Courses", path: "/courses" },
        { icon: SearchIcon, label: "Scheduler", path: "/scheduler" },
        { icon: Squirrel, label: "Gallery", path: "/gallery" },
    ];

    return (
        <aside 
            className={`${ss['sidebar']} ${isExpanded ? ss['expanded'] : ''}`}
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}>
            <div className={ss['sidebar-header']}>
                <span className={ss['sidebar-header-logo']}><img src="/plover-stencil.svg" className='logo plover' alt="Plover 'logo'" /></span>
                <span className={ss['sidebar-header-title']}>Plover</span>
            </div>

            <nav className={ss['sidebar-nav']}>
                {sidebarItems.map((item) => (
                    <SidebarItem
                        key={item.path}
                        icon={item.icon}
                        label={item.label}
                        to={item.path}/>
                ))}
            </nav>

            <div className={ss['sidebar-footer']}>
                {/*<IconButton icon={<Gear/>} size="lg" className={ss['sidebar-item-icon']}/> */}

            </div>
        </aside>
    );
}

export default Sidebar;