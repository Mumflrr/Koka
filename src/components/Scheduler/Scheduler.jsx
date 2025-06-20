// src/components/Scheduler/Scheduler.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
// shallow import is not strictly needed if we select granularly or if actions are stable
// import { shallow } from 'zustand/shallow'; 
import useStore, { stringifySchedule } from '../../Store.jsx';
import processEvents from '../CalendarGrid/processEvents';
import CalendarGrid from '../CalendarGrid/CalendarGrid';
import Sidebar from "../Sidebar/Sidebar";
import ss from './Scheduler.module.css';

const Scheduler = () => {
    // Select individual state pieces
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
    // schedulerSeed removed

    // Select individual actions (references are stable)
    const loadSchedulerPage = useStore(state => state.loadSchedulerPage);
    const createUserEvent = useStore(state => state.createUserEvent);
    const updateUserEvent = useStore(state => state.updateUserEvent);
    const deleteUserEvent = useStore(state => state.deleteUserEvent);
    const storeGenerateSchedules = useStore(state => state.generateSchedules);
    const toggleFavoriteSchedule = useStore(state => state.toggleFavoriteSchedule);
    const storeDeleteSchedule = useStore(state => state.deleteSchedule);
    const setSelectedSchedule = useStore(state => state.setSelectedSchedule);
    const setHoveredSchedule = useStore(state => state.setHoveredSchedule);
    const clearHoveredSchedule = useStore(state => state.clearHoveredSchedule);
    const showEventDetailsModal = useStore(state => state.showEventDetailsModal);
    const closeEventDetailsModal = useStore(state => state.closeEventDetailsModal);
    const toggleRenderFavorites = useStore(state => state.toggleRenderFavorites);
    const storeSetActiveTab = useStore(state => state.setActiveTab);
    const storeToggleParamCheckbox = useStore(state => state.toggleParamCheckbox);
    const storeAddClass = useStore(state => state.addClass);
    const storeUpdateClass = useStore(state => state.updateClass);
    const storeDeleteClass = useStore(state => state.deleteClass);

    useEffect(() => {
        loadSchedulerPage();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // loadSchedulerPage reference is stable

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
    
    const schedulesStringArray = useMemo(() => schedules.map(s => stringifySchedule(s)).filter(s => s !== null), [schedules]);
    const favoritedScheduleStrings = useMemo(() => new Set(favoritedSchedules.map(s => stringifySchedule(s)).filter(s => s !== null)), [favoritedSchedules]);


    const renderScrollbar = () => {
        const schedulesToRender = renderFavorites ? favoritedSchedules : schedules;
        const isEmpty =
            !schedulesToRender || !schedulesToRender.length ||
            (schedulesToRender.length === 1 && (!schedulesToRender[0] || !schedulesToRender[0].length));

        return (
            // Removed key={schedulerSeed}
            <div className={ss.schedulesContainer}> 
                <div className={ss.listActions}>
                    <button
                        className={`${ss.toggleButton} ${ss.button} ${renderFavorites ? ss.active : ''}`}
                        onClick={toggleRenderFavorites}>
                        {renderFavorites ? "★ Favorites" : "Show Favorites"}
                    </button>
                </div>

                {isEmpty ? (
                    <div className={ss['empty-message']}>
                        {renderFavorites ? "You have no favorited schedules." : 
                         (scrapeState.isScraping ? "Generating..." : 
                          (scrapeState.status && scrapeState.status.includes("No matching") ? scrapeState.status : "No schedules have been generated yet." )
                         )
                        }
                    </div>
                ) : (
                    schedulesToRender.map((schedule, i) => {
                        const currentScheduleString = stringifySchedule(schedule);
                        if (!currentScheduleString) return null;

                        const isFavorite = favoritedScheduleStrings.has(currentScheduleString);
                        const displayIndex = schedulesStringArray.indexOf(currentScheduleString);
                        const displayNum = displayIndex !== -1 ? displayIndex + 1 : "?";
                        const isSelected = displayIndex !== -1 && displayIndex === selectedScheduleIndex;

                        return (
                            <div
                                key={currentScheduleString || `schedule-item-${i}`} // Key without seed
                                className={`${ss.scheduleItem} ${isSelected ? ss['selected-schedule'] : ''}`}
                                onClick={() => setSelectedSchedule(displayIndex)}
                                onMouseEnter={() => setHoveredSchedule(schedule)} 
                                onMouseLeave={clearHoveredSchedule} 
                            >
                                <button
                                    className={`${ss['favorite-button']} ${isFavorite ? ss['favorited'] : ''}`}
                                    onClick={(e) => { e.stopPropagation(); toggleFavoriteSchedule(schedule, currentScheduleString, isFavorite); }}
                                    aria-label={`${isFavorite ? 'Unfavorite' : 'Favorite'} Schedule ${displayNum}`}
                                >
                                    {isFavorite ? '★' : '☆'}
                                </button>
                                <span>Schedule {displayNum}</span>
                                <button
                                    className={ss.iconButton}
                                    onClick={(e) => { e.stopPropagation(); storeDeleteSchedule(currentScheduleString, isFavorite); }}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        );
                    })
                )}
            </div>
        );
    };

    const ClassCard = ({ classData, onUpdate, onDelete }) => {
        const [displayedCourseCode, setDisplayedCourseCode] = useState(`${classData.code || ''}${classData.name || ''}`);
        const [formData, setFormData] = useState({
            id: classData.id,
            code: classData.code || '',
            name: classData.name || '',
            section: classData.section || '',
            instructor: classData.instructor || '',
        });
        const [validation, setValidation] = useState({
            courseCodeValid: true,
            sectionCodeValid: true
        });
        const [modifiedFields, setModifiedFields] = useState({});

        useEffect(() => {
            setFormData({
                id: classData.id,
                code: classData.code || '',
                name: classData.name || '',
                section: classData.section || '',
                instructor: classData.instructor || '',
            });
            setDisplayedCourseCode(
                (classData.code && classData.name) ? `${classData.code}${classData.name}` : (classData.code || '')
            );
            setValidation({ courseCodeValid: true, sectionCodeValid: true });
            setModifiedFields({});
        }, [classData]);

        const handleDelete = () => {
            onDelete(classData.id);
        };

        const handleChange = (e) => {
            const { name, value } = e.target;
            setModifiedFields(prev => ({ ...prev, [name]: true }));

            if (name === 'code') {
                setDisplayedCourseCode(value);
                const cleanedValue = value.replace(/\s+/g, '').toUpperCase();
                const courseCodeRegex = /^([A-Z]{1,4})(\d{3,4})$/;
                const match = cleanedValue.match(courseCodeRegex);
                if (match) {
                    setFormData(prev => ({ ...prev, code: match[1], name: match[2] }));
                    setValidation(prev => ({...prev, courseCodeValid: true}));
                } else {
                    setFormData(prev => ({ ...prev, code: value.substring(0,4), name: value.substring(4) }));
                    setValidation(prev => ({...prev, courseCodeValid: false}));
                }
            } else if (name === 'section') {
                const cleanedValue = value.replace(/\s+/g, '').toUpperCase();
                const sectionRegex = /^\d{1,3}[A-Z]{0,2}$/;
                const isValid = sectionRegex.test(cleanedValue) || value === '';
                setFormData(prev => ({ ...prev, [name]: value })); // Store user input as is
                setValidation(prev => ({...prev, sectionCodeValid: isValid}));
            } else {
                setFormData(prev => ({ ...prev, [name]: value }));
            }
        };

        const handleBlur = async (e) => {
            const { name } = e.target;
            if (modifiedFields[name]) {
                if (!validation.courseCodeValid && name === 'code') return;
                if (!validation.sectionCodeValid && name === 'section') return;
                
                // For 'code', ensure the parsed code and name are sent if valid
                const dataToSend = {...formData};
                if (name === 'code' && validation.courseCodeValid) {
                     const cleanedValue = displayedCourseCode.replace(/\s+/g, '').toUpperCase();
                     const courseCodeRegex = /^([A-Z]{1,4})(\d{3,4})$/;
                     const match = cleanedValue.match(courseCodeRegex);
                     if (match) {
                        dataToSend.code = match[1];
                        dataToSend.name = match[2];
                     }
                }
                onUpdate(dataToSend);
                setModifiedFields(prev => ({ ...prev, [name]: false }));
            }
        };

        return (
          <div className={`${ss.classCard} ${!validation.courseCodeValid || !validation.sectionCodeValid ? ss.invalidCard : ''}`}>
            <div className={ss.cardHeader}>
              <input
                type="text" name="code" value={displayedCourseCode}
                onChange={handleChange} onBlur={handleBlur}
                className={`${ss.inputField} ${!validation.courseCodeValid ? ss.invalidInput : ''}`} 
                placeholder="Course (e.g. CSC116)"
              />
              <button type="button" className={ss.iconButton} onClick={handleDelete}>
                <Trash2 size={16} />
              </button>
            </div>
            <input
              type="text" name="section" value={formData.section}
              onChange={handleChange} onBlur={handleBlur}
              className={`${ss.inputField} ${!validation.sectionCodeValid ? ss.invalidInput : ''}`}
              placeholder="Section (e.g. 001, 601, 01L)"
            />
            <input
              type="text" name="instructor" value={formData.instructor}
              onChange={handleChange} onBlur={handleBlur}
              className={ss.inputField} placeholder="Instructor (optional)"
            />
          </div>
        );
    };

    const AddClassCard = ({ onClick }) => (
      <div className={ss.addClassCard} onClick={onClick}>
        <button className={ss.addButtonCard}>
          <Plus size={20} />
          <span>Add Course</span>
        </button>
      </div>
    );
    
    const renderClassesList = () => (
        <div className={ss.classesContainer}>
            {classes.map((classItem) => (
                <ClassCard
                    key={classItem.id} classData={classItem}
                    onUpdate={storeUpdateClass} onDelete={storeDeleteClass} />
            ))}
            <AddClassCard onClick={storeAddClass} />
        </div>
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
    
    if (schedulerError && !scrapeState.status) { // Only show general error if no specific scrape status
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

    const { isScraping, status: scrapeStatus } = scrapeState;

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
                <aside className={ss.controlPanel}>
                    <div className={ss.generationControls}>
                        <button
                            className={`${ss.button} ${ss['button-primary']}`}
                            onClick={storeGenerateSchedules}
                            disabled={isScraping || classes.length === 0}
                        >
                            {isScraping ? "Generating..." : "Generate Schedules"}
                        </button>
                        <div className={ss.paramToggles}>
                            <button className={`${ss.button} ${ss.toggleButton} ${paramCheckboxes.box1 ? ss.active : ''}`} onClick={() => storeToggleParamCheckbox('box1')}>
                                Open Sections Only
                            </button>
                            <button className={`${ss.button} ${ss.toggleButton} ${paramCheckboxes.box2 ? ss.active : ''}`} onClick={() => storeToggleParamCheckbox('box2')}>
                                Waitlist OK
                            </button>
                        </div>
                        {isScraping && (
                            <div className={ss['loading-indicator']}>
                                <div className={ss['spinner']}></div>
                                <p>Scraping in progress...</p>
                            </div>
                        )}
                        {scrapeStatus && !isScraping && (
                            <div className={`${ss['status-message']} ${
                                scrapeStatus.includes("Error") || scrapeStatus.includes("failed") || scrapeStatus.includes("No matching") ? ss['status-error'] : ss['status-success']
                            }`}>
                                {scrapeStatus}
                            </div>
                        )}
                         {schedulerError && scrapeStatus && ( // Show general error alongside scrape status if both exist
                            <div className={`${ss['status-message']} ${ss['status-error']}`} style={{marginTop: '0.5rem'}}>
                                Additional Info: {schedulerError}
                            </div>
                        )}
                    </div>
                    <div className={ss.listContainer}>
                        <div className={ss.listTabs}>
                            <button className={`${ss.tabButton} ${activeTab === 'schedules' ? ss.active : ''}`} onClick={() => storeSetActiveTab('schedules')}>
                                Schedules
                            </button>
                            <button className={`${ss.tabButton} ${activeTab === 'classes' ? ss.active : ''}`} onClick={() => storeSetActiveTab('classes')}>
                                Courses
                            </button>
                        </div>
                        <div className={ss.listContent}>
                           {activeTab === 'schedules' && renderScrollbar()}
                           {activeTab === 'classes' && renderClassesList()}
                        </div>
                    </div>
                </aside>
            </main>
        </div>
    );
};

export default Scheduler;