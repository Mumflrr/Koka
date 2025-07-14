import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, Plus, X } from 'lucide-react';
import { stringifySchedule } from '../../Store.jsx';

const ClassCard = React.memo(({ classData, onUpdate, onDelete, ss }) => {
    const [displayedCourseCode, setDisplayedCourseCode] = useState('');
    const [displayedSection, setDisplayedSection] = useState('');
    const [displayedInstructor, setDisplayedInstructor] = useState('');
    const [formData, setFormData] = useState({ id: '', code: '', name: '', section: '', instructor: '' });
    const [validation, setValidation] = useState({ courseCodeValid: true, sectionCodeValid: true, instructorValid: true });
    const [modifiedFields, setModifiedFields] = useState({});

    useEffect(() => {
        const initialFormData = {
            id: classData.id,
            code: classData.code || '',
            name: classData.name || '',
            section: classData.section || '',
            instructor: classData.instructor || '',
        };
        setFormData(initialFormData);
        setDisplayedCourseCode(`${initialFormData.code || ''}${initialFormData.name || ''}`);
        setDisplayedSection(initialFormData.section);
        setDisplayedInstructor(initialFormData.instructor);
        setValidation({ courseCodeValid: true, sectionCodeValid: true, instructorValid: true });
        setModifiedFields({});
    }, [classData.id]);

    const handleDelete = useCallback(() => onDelete(classData.id), [onDelete, classData.id]);

    const handleChange = useCallback((e) => {
        const { name, value } = e.target;
        setModifiedFields(prev => ({ ...prev, [name]: true }));

        if (name === 'code') {
            setDisplayedCourseCode(value);
            const cleanedValue = value.replace(/\s+/g, '').toUpperCase();
            const courseCodeRegex = /^([A-Z]{2,3})(\d{3})$/;
            const match = cleanedValue.match(courseCodeRegex);
            
            if (match) {
                setFormData(prev => ({ ...prev, code: match[1], name: match[2] }));
                setValidation(prev => ({ ...prev, courseCodeValid: true }));
            } else {
                setValidation(prev => ({ ...prev, courseCodeValid: false }));
            }
        } else if (name === 'section') {
            setDisplayedSection(value); 
            setFormData(prev => ({ ...prev, [name]: value }));

            const cleanedValue = value.replace(/\s+/g, '').toUpperCase();
            const sectionRegex = /^(\d{3}[A-Z]?)$/;
            const isValid = sectionRegex.test(cleanedValue) || value.trim() === '';
            
            setValidation(prev => ({ ...prev, sectionCodeValid: isValid }));

        } else if (name === 'instructor') {
            setDisplayedInstructor(value);
            
            // Check if instructor name contains a comma
            const instructorRegex = /^[^,]+,/;
            const isValid = instructorRegex.test(value.trim()) || value.trim() === '';
            
            setValidation(prev => ({ ...prev, instructorValid: isValid }));
            
            // Clean up whitespace after comma for the actual form data - remove ALL whitespace after comma
            const cleanedInstructor = value.replace(/,\s*/g, ',').trim();
            setFormData(prev => ({ ...prev, instructor: cleanedInstructor }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    }, []);
    
    const handleBlur = useCallback(() => {
        if (!Object.values(modifiedFields).some(Boolean)) {
            return;
        }

        const isFormValid = validation.courseCodeValid && validation.sectionCodeValid && validation.instructorValid;
        if (!isFormValid) {
            console.warn("Save aborted due to validation errors.");
            const originalData = classData;
            setDisplayedCourseCode(`${originalData.code || ''}${originalData.name || ''}`);
            setDisplayedSection(originalData.section || '');
            setDisplayedInstructor(originalData.instructor || '');
            setFormData({
                id: originalData.id,
                code: originalData.code || '',
                name: originalData.name || '',
                section: originalData.section || '',
                instructor: originalData.instructor || ''
            });
            setValidation({ courseCodeValid: true, sectionCodeValid: true, instructorValid: true });
            setModifiedFields({});
            return;
        }
        
        const finalCleanedSection = formData.section.replace(/\s+/g, '').toUpperCase();
        const finalCleanedInstructor = formData.instructor.replace(/,\s*/g, ',').trim();
        const finalFormData = { 
            ...formData, 
            section: finalCleanedSection,
            instructor: finalCleanedInstructor
        };

        onUpdate(finalFormData);
        setModifiedFields({});
    }, [modifiedFields, validation, formData, onUpdate, classData]);

    return (
      <div className={`${ss.classCard} ${!validation.courseCodeValid || !validation.sectionCodeValid || !validation.instructorValid ? ss.invalidCard : ''}`}>
        <div className={ss.cardHeader}>
          <div className={ss.inputContainer}>
            <input
              type="text" name="code" value={displayedCourseCode}
              onChange={handleChange} onBlur={handleBlur}
              className={`${ss.inputField} ${!validation.courseCodeValid ? ss.invalidInput : ''}`} 
              placeholder="Course (e.g. CSC116)"
            />
            {!validation.courseCodeValid && displayedCourseCode.trim() !== '' && (
              <div className={ss.errorMessage}>Invalid field</div>
            )}
          </div>
          <button type="button" className={ss.iconButton} onClick={handleDelete}>
            <Trash2 size={16} />
          </button>
        </div>
        <div className={ss.inputContainer}>
          <input
            type="text" name="section" 
            value={displayedSection}
            onChange={handleChange} onBlur={handleBlur}
            className={`${ss.inputField} ${!validation.sectionCodeValid ? ss.invalidInput : ''}`}
            placeholder="Section (e.g. 001, 001L)"
          />
          {!validation.sectionCodeValid && displayedSection.trim() !== '' && (
            <div className={ss.errorMessage}>Invalid field</div>
          )}
        </div>
        <div className={ss.inputContainer}>
          <input
            type="text" name="instructor" value={displayedInstructor}
            onChange={handleChange} onBlur={handleBlur}
            className={`${ss.inputField} ${!validation.instructorValid ? ss.invalidInput : ''}`}
            placeholder="Last,First M.I. (Must match myPack)"
          />
          {!validation.instructorValid && displayedInstructor.trim() !== '' && (
            <div className={ss.errorMessage}>Invalid field</div>
          )}
        </div>
      </div>
    );
});

const AddClassCard = React.memo(({ onClick, ss }) => (
  <div className={ss.addClassCard} onClick={onClick}>
    <button className={ss.addButtonCard}>
      <Plus size={20} />
      <span>Add Course</span>
    </button>
  </div>
));

const SchedulesList = React.memo(({
    renderFavorites, favoritedSchedules, schedules, scrapeState, favoritedScheduleStrings,
    selectedScheduleId, toggleRenderFavorites, setSelectedSchedule, setHoveredSchedule,
    clearHoveredSchedule, toggleFavoriteSchedule, deleteSchedule, getScheduleDisplayNumber, ss
}) => {
    const schedulesToRender = renderFavorites ? favoritedSchedules : schedules;
    const isEmpty = !schedulesToRender?.some(s => s?.length > 0);

    return (
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
                    const displayNum = getScheduleDisplayNumber(currentScheduleString);
                    const isSelected = currentScheduleString === selectedScheduleId;

                    return (
                        <div
                            key={currentScheduleString || `schedule-item-${i}`}
                            className={`${ss.scheduleItem} ${isSelected ? ss['selected-schedule'] : ''}`}
                            onClick={() => setSelectedSchedule(schedule)}
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
                                onClick={(e) => { e.stopPropagation(); deleteSchedule(currentScheduleString, isFavorite); }}
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    );
                })
            )}
        </div>
    );
});

const ClassesList = React.memo(({ classes, updateClass, deleteClass, addClass, ss }) => (
    <div className={ss.classesContainer}>
        {classes.map((classItem) => (
            <ClassCard
                key={classItem.id}
                classData={classItem}
                onUpdate={updateClass}
                onDelete={deleteClass}
                ss={ss}
            />
        ))}
        <AddClassCard onClick={addClass} ss={ss} />
    </div>
));

//FIXME Reduce prop drilling
const CourseManagementPanel = ({
    schedules, favoritedSchedules, selectedScheduleId, scrapeState, paramCheckboxes,
    classes, activeTab, renderFavorites, schedulerError, schedulesStringArray,
    favoritedScheduleStrings, generateSchedules, clearScrapeStatus, toggleFavoriteSchedule,
    deleteSchedule, setSelectedSchedule, setHoveredSchedule, clearHoveredSchedule,
    toggleRenderFavorites, setActiveTab, toggleParamCheckbox, addClass, updateClass,
    deleteClass, getScheduleDisplayNumber, ss
}) => {
    const { isScraping, status: scrapeStatus } = scrapeState;

    return (
        <aside className={ss.controlPanel}>
            <div className={ss.generationControls}>
                <button
                    className={`${ss.button} ${ss['button-primary']}`}
                    onClick={generateSchedules}
                    disabled={isScraping || classes.length === 0}
                >
                    {isScraping ? "Generating..." : "Generate Schedules"}
                </button>
                <div className={ss.paramToggles}>
                    <button className={`${ss.button} ${ss.toggleButton} ${paramCheckboxes.box1 ? ss.active : ''}`} onClick={() => toggleParamCheckbox('box1')}>
                        Open Sections Only
                    </button>
                    <button className={`${ss.button} ${ss.toggleButton} ${paramCheckboxes.box2 ? ss.active : ''}`} onClick={() => toggleParamCheckbox('box2')}>
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
                        <span>{scrapeStatus}</span>
                        <button
                            className={ss.closeButton}
                            onClick={clearScrapeStatus}
                            aria-label="Close status message"
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}
                 {schedulerError && scrapeStatus && (
                    <div className={`${ss['status-message']} ${ss['status-error']}`} style={{marginTop: '0.5rem'}}>
                        <span>Additional Info: {schedulerError}</span>
                        <button
                            className={ss.closeButton}
                            onClick={clearScrapeStatus}
                            aria-label="Close error message"
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}
            </div>
            <div className={ss.listContainer}>
                <div className={ss.listTabs}>
                    <button className={`${ss.tabButton} ${activeTab === 'schedules' ? ss.active : ''}`} onClick={() => setActiveTab('schedules')}>
                        Schedules
                    </button>
                    <button className={`${ss.tabButton} ${activeTab === 'classes' ? ss.active : ''}`} onClick={() => setActiveTab('classes')}>
                        Courses
                    </button>
                </div>
                <div className={ss.listContent}>
                   {activeTab === 'schedules' && (
                        <SchedulesList
                            renderFavorites={renderFavorites}
                            favoritedSchedules={favoritedSchedules}
                            schedules={schedules}
                            scrapeState={scrapeState}
                            favoritedScheduleStrings={favoritedScheduleStrings}
                            selectedScheduleId={selectedScheduleId}
                            toggleRenderFavorites={toggleRenderFavorites}
                            setSelectedSchedule={setSelectedSchedule}
                            setHoveredSchedule={setHoveredSchedule}
                            clearHoveredSchedule={clearHoveredSchedule}
                            toggleFavoriteSchedule={toggleFavoriteSchedule}
                            deleteSchedule={deleteSchedule}
                            getScheduleDisplayNumber={getScheduleDisplayNumber}
                            ss={ss}
                        />
                   )}
                   {activeTab === 'classes' && (
                        <ClassesList
                            classes={classes}
                            updateClass={updateClass}
                            deleteClass={deleteClass}
                            addClass={addClass}
                            ss={ss}
                        />
                   )}
                </div>
            </div>
        </aside>
    );
};

export default CourseManagementPanel;