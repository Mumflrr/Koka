import { useEffect, useMemo } from 'react';
import useStore, { stringifySchedule } from '../../Store.jsx';
import CalendarGrid from './CalendarGrid/CalendarGrid.jsx';
import Sidebar from "../Sidebar/Sidebar";
import CourseManagementPanel from './CourseManagementPanel';
import ss from './Scheduler.module.css';

//FIXME async classes not showing
//FIXME schedule numbers still escalating 

/**
 * Processes preview events from schedule data for calendar display
 * Converts raw schedule events into formatted calendar events with positioning
 * 
 * @param {Array} previewEvents - Array of raw preview event objects
 * @param {Object} previewEvents[].day - Day bitmask indicating which days the event occurs
 * @param {number} previewEvents[].startTime - Start time as integer (HHMM format)
 * @param {number} previewEvents[].endTime - End time as integer (HHMM format)
 * @returns {Object} Processed events organized by day and time category
 * @returns {Object} returns.eventsByDay - Events with specific times, keyed by day
 * @returns {Object} returns.noTimeEventsByDay - Events without specific times, keyed by day
 * 
 * @example
 * const events = [
 *   { day: 6, startTime: 900, endTime: 1050, title: "Math 101" }
 * ];
 * const { eventsByDay, noTimeEventsByDay } = processPreviewEvents(events);
 */
const processPreviewEvents = (previewEvents) => {
    const eventsByDay = {};
    const noTimeEventsByDay = {};

    // Calendar display constants
    const START_HOUR = 8;
    const END_HOUR = 20;
    const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;

    /**
     * Formats time integer to HH:MM string format
     * @param {number} timeInt - Time as integer (e.g., 930 for 9:30)
     * @returns {string} Formatted time string (e.g., "09:30")
     */
    const formatTime = (timeInt) => {
        if (timeInt <= 0) return "00:00";
        const timeStr = timeInt.toString().padStart(4, '0');
        return `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}`;
    };

    /**
     * Calculates minutes elapsed since START_HOUR for positioning
     * @param {number} timeInt - Time as integer (HHMM format)
     * @returns {number} Minutes since start of calendar display
     */
    const getMinutesSinceStart = (timeInt) => {
        if (timeInt <= 0) return 0;
        const hours = Math.floor(timeInt / 100);
        const minutes = timeInt % 100;
        return (hours * 60 + minutes) - (START_HOUR * 60);
    };

    // Process each preview event
    previewEvents.forEach(event => {
        // Check each day bit in the bitmask (0-6 for days of week)
        for (let dayBitIndex = 0; dayBitIndex < 7; dayBitIndex++) {
            if ((event.day & (1 << dayBitIndex)) !== 0) {
                const dayKey = dayBitIndex.toString();

                // Create processed event with formatting and positioning
                const processedEvent = {
                    ...event,
                    startTimeFormatted: formatTime(event.startTime),
                    endTimeFormatted: formatTime(event.endTime),
                    startTimeInt: event.startTime,
                    endTimeInt: event.endTime,
                    width: "100%",
                    left: "0%",
                    topPosition: "0%",
                    heightPosition: "0%"
                };

                // Categorize by whether event has specific times
                if (event.startTime > 0 && event.endTime > 0) {
                    // Calculate positioning for timed events on the calendar
                    const startMinutes = getMinutesSinceStart(event.startTime);
                    const endMinutes = getMinutesSinceStart(event.endTime);
                    const duration = Math.max(endMinutes - startMinutes, 0);

                    processedEvent.topPosition = `${(startMinutes / TOTAL_MINUTES) * 100}%`;
                    processedEvent.heightPosition = `${(duration / TOTAL_MINUTES) * 100}%`;

                    if (!eventsByDay[dayKey]) eventsByDay[dayKey] = [];
                    eventsByDay[dayKey].push(processedEvent);
                } else {
                    // No-time events go in separate category (top bar)
                    if (!noTimeEventsByDay[dayKey]) noTimeEventsByDay[dayKey] = [];
                    noTimeEventsByDay[dayKey].push(processedEvent);
                }
            }
        }
    });

    return { eventsByDay, noTimeEventsByDay };
};

/**
 * Main Scheduler component - renders the complete scheduling interface
 * Manages calendar display, course management, and schedule generation
 * 
 * @component
 * @returns {JSX.Element} The complete scheduler interface
 * 
 * @example
 * // Basic usage
 * <Scheduler />
 * 
 * @description
 * This component:
 * - Loads and displays user events and generated schedules
 * - Provides calendar interface for event creation/editing
 * - Manages course parameters and schedule generation
 * - Handles preview of selected/hovered schedules
 * - Integrates sidebar navigation and course management panel
 */
const Scheduler = () => {
    // --- STATE SELECTORS ---
    // Select all state individually for optimal reactivity and re-render control
    
    /** @type {Object} User-created events organized by day and time category */
    const userEvents = useStore(state => state.userEvents);
    
    /** @type {Array} Generated schedules array */
    const schedules = useStore(state => state.schedules);
    
    /** @type {string|null} Currently selected/pinned schedule ID */
    const selectedScheduleId = useStore(state => state.selectedScheduleId);
    
    /** @type {Object|null} Schedule being hovered for preview */
    const currentHoveredSchedule = useStore(state => state.currentHoveredSchedule);
    
    /** @type {Object|null} Event object for details modal */
    const detailsEvent = useStore(state => state.detailsEvent);
    
    /** @type {boolean} Loading state for initial data fetch */
    const schedulerLoading = useStore(state => state.schedulerLoading);
    
    /** @type {string|null} Error message for scheduler operations */
    const schedulerError = useStore(state => state.schedulerError);
    
    /** @type {Object} Schedule generation state and status */
    const scrapeState = useStore(state => state.scrapeState);

    // --- ACTION SELECTORS ---
    // Select all actions individually for stability and preventing unnecessary re-renders
    
    const loadSchedulerPage = useStore(state => state.loadSchedulerPage);
    const createUserEvent = useStore(state => state.createUserEvent);
    const updateUserEvent = useStore(state => state.updateUserEvent);
    const deleteUserEvent = useStore(state => state.deleteUserEvent);
    const showEventDetailsModal = useStore(state => state.showEventDetailsModal);
    const closeEventDetailsModal = useStore(state => state.closeEventDetailsModal);

    // --- EFFECTS ---
    
    /**
     * Load initial scheduler data on component mount
     * Stable effect that runs once due to loadSchedulerPage dependency
     */
    useEffect(() => {
        loadSchedulerPage();
    }, [loadSchedulerPage]);

    // --- MEMOIZED CALCULATIONS ---
    
    /**
     * Combines user events with preview events from selected/hovered schedules
     * Memoized to prevent unnecessary recalculations on unrelated state changes
     * 
     * @returns {Object} Combined events organized by day and time category
     * @returns {Object} returns.eventsByDay - All timed events for calendar display
     * @returns {Object} returns.noTimeEventsByDay - All no-time events for calendar display
     */
    const { eventsByDay, noTimeEventsByDay } = useMemo(() => {
        // Determine which schedule to preview (hovered takes precedence over selected)
        const selectedSchedule = selectedScheduleId
            ? schedules.find(s => stringifySchedule(s) === selectedScheduleId)
            : null;
        const scheduleToDisplay = currentHoveredSchedule ?? selectedSchedule;

        // Start with user events as base
        const finalEventsByDay = { ...(userEvents.eventsByDay || {}) };
        const finalNoTimeEventsByDay = { ...(userEvents.noTimeEventsByDay || {}) };

        // If no schedule to preview, return just user events
        if (!scheduleToDisplay) {
            return { eventsByDay: finalEventsByDay, noTimeEventsByDay: finalNoTimeEventsByDay };
        }

        // Extract preview events from schedule data structure
        const previewEvents = scheduleToDisplay.flatMap((courseData) => {
            if (!courseData?.classes?.length) return [];

            return courseData.classes.flatMap((classMeeting) => {
                if (!classMeeting?.days?.length) return null;

                // Build day bitmask and extract meeting times
                let dayBitmask = 0;
                let meetingStartTimeInt = null;
                let meetingEndTimeInt = null;
                let hasAnyActiveDay = false;

                classMeeting.days.forEach((dayInfo, dayUiIndex) => {
                    if (!Array.isArray(dayInfo) || dayInfo.length < 2 || !Array.isArray(dayInfo[0]) || dayInfo[0].length < 2) return;
                    const [timePair, isActive] = dayInfo;
                    if (isActive && timePair[0] !== -1) {
                        dayBitmask |= (1 << (dayUiIndex + 1));
                        if (meetingStartTimeInt === null) {
                            meetingStartTimeInt = timePair[0];
                            meetingEndTimeInt = timePair[1];
                        }
                        hasAnyActiveDay = true;
                    }
                });

                const eventBase = {
                    id: `preview-${courseData.id}-${classMeeting.section}`,
                    isPreview: true,
                    title: `${courseData.code || ''} ${courseData.name || ''}`.trim() + (classMeeting.section ? ` - Sec ${classMeeting.section}` : ''),
                    professor: classMeeting.instructor || '',
                    description: courseData.description || '',
                };

                // If no active days, treat as async/no-time event for all weekdays (Mon-Fri)
                if (!hasAnyActiveDay) {
                    // Place in the top bar for each weekday (dayBitIndex 1-5)
                    return [1,2,3,4,5].map(dayBitIndex => ({
                        ...eventBase,
                        startTime: 0,
                        endTime: 0,
                        day: 1 << dayBitIndex,
                    }));
                }

                // Otherwise, normal event
                if (dayBitmask === 0 || meetingStartTimeInt === null) {
                    return null;
                }

                return {
                    ...eventBase,
                    startTime: meetingStartTimeInt,
                    endTime: meetingEndTimeInt,
                    day: dayBitmask,
                };
            }).filter(Boolean);
        });

        // Process preview events and merge with user events
        const { eventsByDay: previewEventsByDay, noTimeEventsByDay: previewNoTimeEventsByDay } = processPreviewEvents(previewEvents);

        // Merge preview events with user events
        Object.keys(previewEventsByDay).forEach(dayKey => {
            finalEventsByDay[dayKey] = [...(finalEventsByDay[dayKey] || []), ...previewEventsByDay[dayKey]];
        });
        Object.keys(previewNoTimeEventsByDay).forEach(dayKey => {
            finalNoTimeEventsByDay[dayKey] = [...(finalNoTimeEventsByDay[dayKey] || []), ...previewNoTimeEventsByDay[dayKey]];
        });

        return { eventsByDay: finalEventsByDay, noTimeEventsByDay: finalNoTimeEventsByDay };
    }, [userEvents, currentHoveredSchedule, selectedScheduleId, schedules]);

    // --- RESET SCHEDULE INDEX ON GENERATE ---
    // If you have a schedule index in your store, reset it when generating schedules.
    // For example, in your schedule generation action:
    // setScheduleIndex(1); // <-- Reset to 1 each time you generate schedules

    // --- CONDITIONAL RENDERING ---
    
    /**
     * Loading state - show spinner while initial data loads
     */
    if (schedulerLoading) {
        return (
            <div className={ss.container}>
                <Sidebar />
                <div style={{ padding: '2rem', textAlign: 'center', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className={ss['loading-indicator']}>
                        <div className={ss['spinner']}></div>
                        <p>Loading scheduler...</p>
                    </div>
                </div>
            </div>
        );
    }
    
    /**
     * Error state - show error message with retry option
     * Only shows if there's an error and no scrape status (to avoid conflicts)
     */
    if (schedulerError && !scrapeState.status) {
        return (
            <div className={ss.container}>
                <Sidebar />
                <div style={{ padding: '2rem', textAlign: 'center', width: '100%' }}>
                    <div style={{ marginBottom: '1rem', color: 'red' }}>{schedulerError}</div>
                    <button className={`${ss.button} ${ss['button-primary']}`} onClick={loadSchedulerPage}>
                        Retry Load
                    </button>
                </div>
            </div>
        );
    }

    // --- MAIN RENDER ---
    return (
        <div className={ss.container}>
            <Sidebar />
            <main className={ss.mainContent}>
                {/* Calendar display area */}
                <div className={ss.calendarContainer}>
                    <CalendarGrid
                        events={eventsByDay}
                        noTimeEvents={noTimeEventsByDay}
                        onEventCreate={createUserEvent}
                        onEventDelete={deleteUserEvent}
                        onEventUpdate={updateUserEvent}
                        onShowDetails={showEventDetailsModal}
                        detailsEvent={detailsEvent}
                        onCloseDetails={closeEventDetailsModal}
                    />
                </div>
                
                {/* Course management and schedule generation panel */}
                <CourseManagementPanel ss={ss}/>
            </main>
        </div>
    );
};

export default Scheduler;