// src/components/Scheduler/Scheduler.jsx
import React, { useEffect, useMemo } from 'react';
import useStore, { stringifySchedule } from '../../Store.jsx';
import CalendarGrid from '../CalendarGrid/CalendarGrid';
import Sidebar from "../Sidebar/Sidebar";
import CourseManagementPanel from './CourseManagementPanel'; // Import the new component
import ss from './Scheduler.module.css';

// BUG Need to decrement Schedule numbers by 1
// BUG When highlighted favorited schedule is deleted, the schedule below it is flagged as clicked
// Simple frontend processing function for preview events only
const processPreviewEvents = (previewEvents) => {
    const eventsByDay = {};
    const noTimeEventsByDay = {};
    
    // Constants for positioning calculations
    const START_HOUR = 8;
    const END_HOUR = 20;
    const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;
    
    // Helper function to format time
    const formatTime = (timeInt) => {
        if (timeInt <= 0) return "00:00";
        const timeStr = timeInt.toString().padStart(4, '0');
        return `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}`;
    };
    
    // Helper function to get minutes since start hour
    const getMinutesSinceStart = (timeInt) => {
        if (timeInt <= 0) return 0;
        const hours = Math.floor(timeInt / 100);
        const minutes = timeInt % 100;
        return (hours * 60 + minutes) - (START_HOUR * 60);
    };
    
    // Group events by day
    previewEvents.forEach(event => {
        for (let dayBitIndex = 0; dayBitIndex < 7; dayBitIndex++) {
            if ((event.day & (1 << dayBitIndex)) !== 0) {
                const dayKey = dayBitIndex.toString();
                
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
                
                if (event.startTime > 0 && event.endTime > 0) {
                    // Calculate positioning for timed events
                    const startMinutes = getMinutesSinceStart(event.startTime);
                    const endMinutes = getMinutesSinceStart(event.endTime);
                    const duration = Math.max(endMinutes - startMinutes, 0);
                    
                    processedEvent.topPosition = `${(startMinutes / TOTAL_MINUTES) * 100}%`;
                    processedEvent.heightPosition = `${(duration / TOTAL_MINUTES) * 100}%`;
                    
                    if (!eventsByDay[dayKey]) eventsByDay[dayKey] = [];
                    eventsByDay[dayKey].push(processedEvent);
                } else {
                    // No-time events
                    if (!noTimeEventsByDay[dayKey]) noTimeEventsByDay[dayKey] = [];
                    noTimeEventsByDay[dayKey].push(processedEvent);
                }
            }
        }
    });
    
    return { eventsByDay, noTimeEventsByDay };
};

const Scheduler = () => {
    // Use individual selectors to avoid creating new objects on every render
    const userEvents = useStore(state => state.userEvents);
    const schedules = useStore(state => state.schedules);
    const favoritedSchedules = useStore(state => state.favoritedSchedules);
    const selectedScheduleIndex = useStore(state => state.selectedScheduleIndex);
    const currentHoveredSchedule = useStore(state => state.currentHoveredSchedule);
    const detailsEvent = useStore(state => state.detailsEvent);
    const schedulerLoading = useStore(state => state.schedulerLoading);
    const schedulerError = useStore(state => state.schedulerError);
    const scrapeState = useStore(state => state.scrapeState);
    const paramCheckboxes = useStore(state => state.paramCheckboxes);
    const classes = useStore(state => state.classes);
    const activeTab = useStore(state => state.activeTab);
    const renderFavorites = useStore(state => state.renderFavorites);

    // Actions
    const loadSchedulerPage = useStore(state => state.loadSchedulerPage);
    const createUserEvent = useStore(state => state.createUserEvent);
    const updateUserEvent = useStore(state => state.updateUserEvent);
    const deleteUserEvent = useStore(state => state.deleteUserEvent);
    const generateSchedules = useStore(state => state.generateSchedules);
    const clearScrapeStatus = useStore(state => state.clearScrapeStatus);
    const toggleFavoriteSchedule = useStore(state => state.toggleFavoriteSchedule);
    const deleteSchedule = useStore(state => state.deleteSchedule);
    const setSelectedSchedule = useStore(state => state.setSelectedSchedule);
    const setHoveredSchedule = useStore(state => state.setHoveredSchedule);
    const clearHoveredSchedule = useStore(state => state.clearHoveredSchedule);
    const showEventDetailsModal = useStore(state => state.showEventDetailsModal);
    const closeEventDetailsModal = useStore(state => state.closeEventDetailsModal);
    const toggleRenderFavorites = useStore(state => state.toggleRenderFavorites);
    const setActiveTab = useStore(state => state.setActiveTab);
    const toggleParamCheckbox = useStore(state => state.toggleParamCheckbox);
    const addClass = useStore(state => state.addClass);
    const updateClass = useStore(state => state.updateClass);
    const deleteClass = useStore(state => state.deleteClass);
    const getScheduleDisplayNumber = useStore(state => state.getScheduleDisplayNumber);

    useEffect(() => {
        loadSchedulerPage();
    }, [loadSchedulerPage]);

    const { eventsByDay, noTimeEventsByDay } = useMemo(
        () => {
            const scheduleToDisplay =
                currentHoveredSchedule ??
                (selectedScheduleIndex !== null && schedules && schedules[selectedScheduleIndex]
                    ? schedules[selectedScheduleIndex]
                    : null);

            // User events are now already processed from the backend
            // userEvents should now be in the format: { eventsByDay: {...}, noTimeEventsByDay: {...} }
            let finalEventsByDay = { ...(userEvents.eventsByDay || {}) };
            let finalNoTimeEventsByDay = { ...(userEvents.noTimeEventsByDay || {}) };

            // Process preview events from schedules (still needs frontend processing)
            if (scheduleToDisplay && Array.isArray(scheduleToDisplay)) {
                const previewEvents = scheduleToDisplay.flatMap((courseData, courseIndex) => {
                    if (!courseData || !courseData.classes || !Array.isArray(courseData.classes)) {
                        return [];
                    }
                    return courseData.classes.map((classMeeting, meetingIndex) => {
                        if (!classMeeting || !classMeeting.days || !Array.isArray(classMeeting.days)) {
                            return null;
                        }
                        let dayBitmask = 0;
                        let meetingStartTimeInt = null;
                        let meetingEndTimeInt = null;
                        let hasAnyActiveDay = false;
                        classMeeting.days.forEach((dayInfo, dayUiIndex) => {
                            if (!Array.isArray(dayInfo) || dayInfo.length < 2 || !Array.isArray(dayInfo[0]) || dayInfo[0].length < 2) {
                                return;
                            }
                            const timePair = dayInfo[0];
                            const isActive = dayInfo[1];
                            if (isActive && timePair[0] !== -1) {
                                dayBitmask |= (1 << (dayUiIndex + 1));
                                if (meetingStartTimeInt === null) {
                                    meetingStartTimeInt = timePair[0];
                                    meetingEndTimeInt = timePair[1];
                                }
                                hasAnyActiveDay = true;
                            }
                        });
                        const courseIdPart = courseData.id || `${courseData.code || 'course'}${courseData.name || courseIndex}`;
                        const meetingIdPart = classMeeting.section || meetingIndex;
                        const eventId = `preview-${courseIdPart}-${meetingIdPart}`;
                        const title = `${courseData.code || ''} ${courseData.name || ''}`.trim() + (classMeeting.section ? ` - Sec ${classMeeting.section}` : '');
                        
                        if (!hasAnyActiveDay) {
                            return [0, 1, 2, 3, 4].map(dayUiIndex => ({
                                id: `${eventId}-notime-${dayUiIndex}`,
                                isPreview: true,
                                title: title,
                                professor: classMeeting.instructor || '',
                                description: courseData.description || '',
                                startTime: 0,
                                endTime: 0,
                                day: 1 << (dayUiIndex + 1),
                            }));
                        }

                        if (dayBitmask === 0 || meetingStartTimeInt === null) {
                            return null;
                        }
                        return {
                            id: eventId,
                            isPreview: true,
                            title: title,
                            professor: classMeeting.instructor || '',
                            description: courseData.description || '',
                            startTime: meetingStartTimeInt,
                            endTime: meetingEndTimeInt,
                            day: dayBitmask,
                        };
                    }).flat().filter(event => event !== null);
                });

                // Process preview events
                const { eventsByDay: previewEventsByDay, noTimeEventsByDay: previewNoTimeEventsByDay } = processPreviewEvents(previewEvents);
                
                // Merge preview events with user events
                Object.keys(previewEventsByDay).forEach(dayKey => {
                    if (!finalEventsByDay[dayKey]) finalEventsByDay[dayKey] = [];
                    finalEventsByDay[dayKey] = [...finalEventsByDay[dayKey], ...previewEventsByDay[dayKey]];
                });
                
                Object.keys(previewNoTimeEventsByDay).forEach(dayKey => {
                    if (!finalNoTimeEventsByDay[dayKey]) finalNoTimeEventsByDay[dayKey] = [];
                    finalNoTimeEventsByDay[dayKey] = [...finalNoTimeEventsByDay[dayKey], ...previewNoTimeEventsByDay[dayKey]];
                });
            }

            return { 
                eventsByDay: finalEventsByDay, 
                noTimeEventsByDay: finalNoTimeEventsByDay 
            };
        },
        [userEvents, currentHoveredSchedule, selectedScheduleIndex, schedules]
    );
    
    const schedulesStringArray = useMemo(() => 
        schedules.map(s => stringifySchedule(s)).filter(s => s !== null), 
        [schedules]
    );
    
    const favoritedScheduleStrings = useMemo(() => 
        new Set(favoritedSchedules.map(s => stringifySchedule(s)).filter(s => s !== null)), 
        [favoritedSchedules]
    );

    if (schedulerLoading) {
        return (
            <div className={ss.schedulerPage}>
                <Sidebar />
                <div style={{padding: '2rem', textAlign: 'center', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                    <div className={ss['loading-indicator']}>
                        <div className={ss['spinner']}></div>
                        <p>Loading scheduler...</p>
                    </div>
                </div>
            </div>
        );
    }
    
    if (schedulerError && !scrapeState.status) {
        return (
            <div className={ss.schedulerPage}>
                <Sidebar />
                <div style={{padding: '2rem', textAlign: 'center', width: '100%'}}>
                    <div style={{marginBottom: '1rem', color: 'red'}}>{schedulerError}</div>
                    <button className={`${ss.button} ${ss['button-primary']}`} onClick={loadSchedulerPage}>
                        Retry Load
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={ss.schedulerPage}>
            <Sidebar />
            <main className={ss.mainContent}>
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
                <CourseManagementPanel
                    schedules={schedules}
                    favoritedSchedules={favoritedSchedules}
                    selectedScheduleIndex={selectedScheduleIndex}
                    scrapeState={scrapeState}
                    paramCheckboxes={paramCheckboxes}
                    classes={classes}
                    activeTab={activeTab}
                    renderFavorites={renderFavorites}
                    schedulerError={schedulerError}
                    schedulesStringArray={schedulesStringArray}
                    favoritedScheduleStrings={favoritedScheduleStrings}
                    generateSchedules={generateSchedules}
                    clearScrapeStatus={clearScrapeStatus}
                    toggleFavoriteSchedule={toggleFavoriteSchedule}
                    deleteSchedule={deleteSchedule}
                    setSelectedSchedule={setSelectedSchedule}
                    setHoveredSchedule={setHoveredSchedule}
                    clearHoveredSchedule={clearHoveredSchedule}
                    toggleRenderFavorites={toggleRenderFavorites}
                    setActiveTab={setActiveTab}
                    toggleParamCheckbox={toggleParamCheckbox}
                    addClass={addClass}
                    updateClass={updateClass}
                    deleteClass={deleteClass}
                    getScheduleDisplayNumber={getScheduleDisplayNumber}
                    ss={ss}
                />
            </main>
        </div>
    );
};

export default Scheduler;