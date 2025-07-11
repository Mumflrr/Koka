import React, { useEffect, useMemo } from 'react';
import useStore, { stringifySchedule } from '../../Store.jsx';
import CalendarGrid from '../CalendarGrid/CalendarGrid';
import Sidebar from "../Sidebar/Sidebar";
import CourseManagementPanel from './CourseManagementPanel';
import ss from './Scheduler.module.css';

const processPreviewEvents = (previewEvents) => {
    const eventsByDay = {};
    const noTimeEventsByDay = {};

    const START_HOUR = 8;
    const END_HOUR = 20;
    const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;

    const formatTime = (timeInt) => {
        if (timeInt <= 0) return "00:00";
        const timeStr = timeInt.toString().padStart(4, '0');
        return `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}`;
    };

    const getMinutesSinceStart = (timeInt) => {
        if (timeInt <= 0) return 0;
        const hours = Math.floor(timeInt / 100);
        const minutes = timeInt % 100;
        return (hours * 60 + minutes) - (START_HOUR * 60);
    };

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
                    const startMinutes = getMinutesSinceStart(event.startTime);
                    const endMinutes = getMinutesSinceStart(event.endTime);
                    const duration = Math.max(endMinutes - startMinutes, 0);

                    processedEvent.topPosition = `${(startMinutes / TOTAL_MINUTES) * 100}%`;
                    processedEvent.heightPosition = `${(duration / TOTAL_MINUTES) * 100}%`;

                    if (!eventsByDay[dayKey]) eventsByDay[dayKey] = [];
                    eventsByDay[dayKey].push(processedEvent);
                } else {
                    if (!noTimeEventsByDay[dayKey]) noTimeEventsByDay[dayKey] = [];
                    noTimeEventsByDay[dayKey].push(processedEvent);
                }
            }
        }
    });

    return { eventsByDay, noTimeEventsByDay };
};


const Scheduler = () => {
    // --- Select all STATE individually for reactivity ---
    const userEvents = useStore(state => state.userEvents);
    const schedules = useStore(state => state.schedules);
    const favoritedSchedules = useStore(state => state.favoritedSchedules);
    const selectedScheduleId = useStore(state => state.selectedScheduleId);
    const currentHoveredSchedule = useStore(state => state.currentHoveredSchedule);
    const detailsEvent = useStore(state => state.detailsEvent);
    const schedulerLoading = useStore(state => state.schedulerLoading);
    const schedulerError = useStore(state => state.schedulerError);
    const scrapeState = useStore(state => state.scrapeState);
    const paramCheckboxes = useStore(state => state.paramCheckboxes);
    const classes = useStore(state => state.classes);
    const activeTab = useStore(state => state.activeTab);
    const renderFavorites = useStore(state => state.renderFavorites);

    // --- Select all ACTIONS individually for stability ---
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

    // This effect is stable and runs once on mount.
    useEffect(() => {
        loadSchedulerPage();
    }, [loadSchedulerPage]);

    const { eventsByDay, noTimeEventsByDay } = useMemo(() => {
        const selectedSchedule = selectedScheduleId
            ? schedules.find(s => stringifySchedule(s) === selectedScheduleId)
            : null;
        const scheduleToDisplay = currentHoveredSchedule ?? selectedSchedule;

        const finalEventsByDay = { ...(userEvents.eventsByDay || {}) };
        const finalNoTimeEventsByDay = { ...(userEvents.noTimeEventsByDay || {}) };

        if (!scheduleToDisplay) {
            return { eventsByDay: finalEventsByDay, noTimeEventsByDay: finalNoTimeEventsByDay };
        }

        const previewEvents = scheduleToDisplay.flatMap((courseData) => {
            if (!courseData?.classes?.length) return [];
            return courseData.classes.flatMap((classMeeting) => {
                if (!classMeeting?.days?.length) return null;

                let dayBitmask = 0;
                let meetingStartTimeInt = null;
                let meetingEndTimeInt = null;
                
                classMeeting.days.forEach((dayInfo, dayUiIndex) => {
                    if (!Array.isArray(dayInfo) || dayInfo.length < 2 || !Array.isArray(dayInfo[0]) || dayInfo[0].length < 2) return;
                    const [timePair, isActive] = dayInfo;
                    if (isActive && timePair[0] !== -1) {
                        dayBitmask |= (1 << (dayUiIndex + 1));
                        if (meetingStartTimeInt === null) {
                            meetingStartTimeInt = timePair[0];
                            meetingEndTimeInt = timePair[1];
                        }
                    }
                });

                if (dayBitmask === 0) return null;

                return {
                    id: `preview-${courseData.id}-${classMeeting.section}`,
                    isPreview: true,
                    title: `${courseData.code || ''} ${courseData.name || ''}`.trim() + (classMeeting.section ? ` - Sec ${classMeeting.section}` : ''),
                    professor: classMeeting.instructor || '',
                    description: courseData.description || '',
                    startTime: meetingStartTimeInt,
                    endTime: meetingEndTimeInt,
                    day: dayBitmask,
                };
            }).filter(Boolean);
        });

        const { eventsByDay: previewEventsByDay, noTimeEventsByDay: previewNoTimeEventsByDay } = processPreviewEvents(previewEvents);
        
        Object.keys(previewEventsByDay).forEach(dayKey => {
            finalEventsByDay[dayKey] = [...(finalEventsByDay[dayKey] || []), ...previewEventsByDay[dayKey]];
        });
        Object.keys(previewNoTimeEventsByDay).forEach(dayKey => {
            finalNoTimeEventsByDay[dayKey] = [...(finalNoTimeEventsByDay[dayKey] || []), ...previewNoTimeEventsByDay[dayKey]];
        });

        return { eventsByDay: finalEventsByDay, noTimeEventsByDay: finalNoTimeEventsByDay };
    }, [userEvents, currentHoveredSchedule, selectedScheduleId, schedules]);
    
    const schedulesStringArray = useMemo(() => schedules.map(s => stringifySchedule(s)).filter(Boolean), [schedules]);
    
    const favoritedScheduleStrings = useMemo(() => new Set(favoritedSchedules.map(s => stringifySchedule(s)).filter(Boolean)), [favoritedSchedules]);

    if (schedulerLoading) {
        return (
            <div className={ss.schedulerPage}>
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
    
    if (schedulerError && !scrapeState.status) {
        return (
            <div className={ss.schedulerPage}>
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
                {/* --- Pass all props explicitly for stability --- */}
                <CourseManagementPanel
                    schedules={schedules}
                    favoritedSchedules={favoritedSchedules}
                    selectedScheduleId={selectedScheduleId}
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