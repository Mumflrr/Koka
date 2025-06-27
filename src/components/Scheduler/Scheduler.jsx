// src/components/Scheduler/Scheduler.jsx
import React, { useEffect, useMemo } from 'react';
import useStore, { stringifySchedule } from '../../Store.jsx';
import processEvents from '../CalendarGrid/processEvents';
import CalendarGrid from '../CalendarGrid/CalendarGrid';
import Sidebar from "../Sidebar/Sidebar";
import CourseManagementPanel from './CourseManagementPanel'; // Import the new component
import ss from './Scheduler.module.css';

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

            let combinedRawEvents = userEvents.map(event => ({
                ...event,
                isPreview: false,
            }));

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
                combinedRawEvents = [...combinedRawEvents, ...previewEvents];
            }
            return processEvents(combinedRawEvents);
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