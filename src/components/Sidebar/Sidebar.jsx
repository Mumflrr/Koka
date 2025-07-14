import { NavLink } from "react-router-dom";
import { LayoutDashboard, Utensils, Presentation, SearchIcon, Squirrel, Settings } from "lucide-react";
import useStore from '../../Store.jsx';
import ss from "./Sidebar.module.css";

const SidebarItem = ({ icon: Icon, label, to }) => {
  return (
    <NavLink 
      to={to}
      className={({ isActive }) => `${ss['sidebar-item']} ${isActive ? ss.active : ''}`}
    >
      <Icon className={ss['sidebar-item-icon']} />
      <span className={ss['sidebar-item-label']}>{label}</span>
    </NavLink>
  );
};

function Sidebar() {
    const isExpanded = useStore(state => state.isExpanded);
    const setIsExpanded = useStore(state => state.setIsExpanded);
    
    const sidebarItems = [
        { icon: LayoutDashboard, label: "Home", path: "/" },
        { icon: Utensils, label: "Food", path: "/dining" },
        { icon: Presentation, label: "Courses", path: "/courses" },
        { icon: SearchIcon, label: "Scheduler", path: "/scheduler" },
        { icon: Squirrel, label: "Gallery", path: "/gallery" },
    ];

    return (
        <aside 
            className={`${ss.sidebar} ${isExpanded ? ss.expanded : ''}`}
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}>
            
            <div className={ss['sidebar-header']}>
                <img 
                    src="/koaburra-stencil.svg" 
                    className={`${ss['sidebar-header-logo']} logo plover`} 
                    alt="Plover 'logo'" 
                />
                <span className={ss['sidebar-header-title']}>Koaburroo</span>
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
                <SidebarItem icon={Settings} label="Settings" to="/settings" />
            </div>
        </aside>
    );
}

export default Sidebar;