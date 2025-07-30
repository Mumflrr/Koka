import PropTypes from 'prop-types';
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Utensils, Presentation, SearchIcon, Squirrel, Settings } from "lucide-react";
import useStore from '../../Store.jsx';
import ss from "./Sidebar.module.css";

/**
 * Individual sidebar navigation item component
 * Renders a NavLink with icon and label, with active state styling
 * 
 * @component
 * @param {Object} props - Component props
 * @param {React.ComponentType} props.icon - Lucide React icon component to display
 * @param {string} props.label - Text label for the navigation item
 * @param {string} props.to - Route path for navigation
 * @returns {JSX.Element} Styled navigation link with icon and label
 */
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

// PropTypes for SidebarItem
SidebarItem.propTypes = {
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  to: PropTypes.string.isRequired
};

/**
 * Main sidebar navigation component
 * Provides expandable sidebar with navigation items and hover interactions
 * Manages expansion state through global store
 * 
 * @component
 * @returns {JSX.Element} Complete sidebar navigation interface
 */
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
                    src="/koaburra.svg" 
                    className={`${ss['sidebar-header-logo']} logo koaburra`} 
                    alt="Koaburra 'logo'" 
                />
                <span className={ss['sidebar-header-title']}>Koka</span>
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