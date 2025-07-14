// src/components/Scheduler/CourseManagementPanel.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, Plus, X } from 'lucide-react';
import { stringifySchedule } from '../../Store.jsx';

/**
 * @fileoverview Course Management Panel components for schedule generation and course editing
 * Contains components for managing course parameters, generating schedules, and viewing results
 * Handles complex form validation and real-time input formatting for course data
 */

// === INDIVIDUAL COURSE CARD COMPONENT ===

/**
 * Individual course card component with inline editing and validation
 * Handles real-time validation for course codes, sections, and instructor names
 * Uses optimistic updates with rollback on validation failure
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.classData - Course data object
 * @param {string} props.classData.id - Unique course identifier
 * @param {string} props.classData.code - Course code (e.g., "CSC")
 * @param {string} props.classData.name - Course number (e.g., "116")
 * @param {string} props.classData.section - Section identifier (e.g., "001")
 * @param {string} props.classData.instructor - Instructor name in "Last,First" format
 * @param {Function} props.onUpdate - Callback to update course data
 * @param {Function} props.onDelete - Callback to delete course
 * @param {Object} props.ss - CSS module styles object
 * @returns {JSX.Element} Editable course card with validation
 * 
 * @example
 * <ClassCard
 *   classData={{ id: "1", code: "CSC", name: "116", section: "001", instructor: "Smith,John" }}
 *   onUpdate={handleUpdate}
 *   onDelete={handleDelete}
 *   ss={styles}
 * />
 */
const ClassCard = React.memo(({ classData, onUpdate, onDelete, ss }) => {
    // === DISPLAY STATE ===
    // Separate display state from form data to handle real-time formatting
    
    /** @type {string} Combined course code display (e.g., "CSC116") */
    const [displayedCourseCode, setDisplayedCourseCode] = useState('');
    
    /** @type {string} Section display value */
    const [displayedSection, setDisplayedSection] = useState('');
    
    /** @type {string} Instructor display value */
    const [displayedInstructor, setDisplayedInstructor] = useState('');

    // === FORM STATE ===
    
    /** @type {Object} Internal form data matching backend structure */
    const [formData, setFormData] = useState({ id: '', code: '', name: '', section: '', instructor: '' });
    
    /** @type {Object} Validation state for each field */
    const [validation, setValidation] = useState({ courseCodeValid: true, sectionCodeValid: true, instructorValid: true });
    
    /** @type {Object} Tracks which fields have been modified since last save */
    const [modifiedFields, setModifiedFields] = useState({});

    // === INITIALIZATION EFFECT ===
    
    /**
     * Initializes component state when classData changes
     * Resets all display values, form data, and validation state
     */
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

    // === EVENT HANDLERS ===
    
    /**
     * Handles course deletion with memoized callback
     * @type {Function}
     */
    const handleDelete = useCallback(() => onDelete(classData.id), [onDelete, classData.id]);

    /**
     * Handles input changes with real-time validation and formatting
     * Applies different validation rules based on field type
     * @param {Event} e - Input change event
     */
    const handleChange = useCallback((e) => {
        const { name, value } = e.target;
        setModifiedFields(prev => ({ ...prev, [name]: true }));

        if (name === 'code') {
            // === COURSE CODE VALIDATION ===
            // Expected format: 2-3 letters followed by 3 digits (e.g., "CSC116", "MA242")
            setDisplayedCourseCode(value);
            const cleanedValue = value.replace(/\s+/g, '').toUpperCase();
            const courseCodeRegex = /^([A-Z]{2,3})(\d{3})$/;
            const match = cleanedValue.match(courseCodeRegex);
            
            if (match) {
                // Split into separate code and name fields for backend
                setFormData(prev => ({ ...prev, code: match[1], name: match[2] }));
                setValidation(prev => ({ ...prev, courseCodeValid: true }));
            } else {
                setValidation(prev => ({ ...prev, courseCodeValid: false }));
            }
        } else if (name === 'section') {
            // === SECTION VALIDATION ===
            // Expected format: 3 digits optionally followed by a letter (e.g., "001", "001L")
            setDisplayedSection(value); 
            setFormData(prev => ({ ...prev, [name]: value }));

            const cleanedValue = value.replace(/\s+/g, '').toUpperCase();
            const sectionRegex = /^(\d{3}[A-Z]?)$/;
            const isValid = sectionRegex.test(cleanedValue) || value.trim() === '';
            
            setValidation(prev => ({ ...prev, sectionCodeValid: isValid }));

        } else if (name === 'instructor') {
            // === INSTRUCTOR VALIDATION ===
            // Expected format: "Last,First" (must contain comma, matching myPack format)
            setDisplayedInstructor(value);
            
            const instructorRegex = /^[^,]+,/;
            const isValid = instructorRegex.test(value.trim()) || value.trim() === '';
            
            setValidation(prev => ({ ...prev, instructorValid: isValid }));
            
            // Clean up whitespace after comma for consistent formatting
            const cleanedInstructor = value.replace(/,\s*/g, ',').trim();
            setFormData(prev => ({ ...prev, instructor: cleanedInstructor }));
        } else {
            // Handle other fields without special validation
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    }, []);
    
    /**
     * Handles field blur events - triggers save or rollback based on validation
     * Only processes if fields have been modified since last save
     * Rolls back to original values if validation fails
     */
    const handleBlur = useCallback(() => {
        // Skip processing if no fields have been modified
        if (!Object.values(modifiedFields).some(Boolean)) {
            return;
        }

        const isFormValid = validation.courseCodeValid && validation.sectionCodeValid && validation.instructorValid;
        
        if (!isFormValid) {
            // === VALIDATION FAILURE - ROLLBACK ===
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
        
        // === VALIDATION SUCCESS - SAVE ===
        // Apply final cleaning to data before saving
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
        {/* Course Code Input and Delete Button */}
        <div className={ss.cardHeader}>
          <div className={ss.inputContainer}>
            <input
              type="text" 
              name="code" 
              value={displayedCourseCode}
              onChange={handleChange} 
              onBlur={handleBlur}
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
        
        {/* Section Input */}
        <div className={ss.inputContainer}>
          <input
            type="text" 
            name="section" 
            value={displayedSection}
            onChange={handleChange} 
            onBlur={handleBlur}
            className={`${ss.inputField} ${!validation.sectionCodeValid ? ss.invalidInput : ''}`}
            placeholder="Section (e.g. 001, 001L)"
          />
          {!validation.sectionCodeValid && displayedSection.trim() !== '' && (
            <div className={ss.errorMessage}>Invalid field</div>
          )}
        </div>
        
        {/* Instructor Input */}
        <div className={ss.inputContainer}>
          <input
            type="text" 
            name="instructor" 
            value={displayedInstructor}
            onChange={handleChange} 
            onBlur={handleBlur}
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

// === ADD COURSE BUTTON COMPONENT ===

/**
 * Simple button component for adding new course cards
 * Displays a styled add button with icon and text
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Function} props.onClick - Callback when add button is clicked
 * @param {Object} props.ss - CSS module styles object
 * @returns {JSX.Element} Add course button
 */
const AddClassCard = React.memo(({ onClick, ss }) => (
  <div className={ss.addClassCard} onClick={onClick}>
    <button className={ss.addButtonCard}>
      <Plus size={20} />
      <span>Add Course</span>
    </button>
  </div>
));

// === SCHEDULES LIST COMPONENT ===

/**
 * Component for displaying and managing generated schedules and favorites
 * Handles switching between regular schedules and favorites view
 * Provides schedule selection, favoriting, and deletion functionality
 * 
 * @component
 * @param {Object} props - Component props
 * @param {boolean} props.renderFavorites - Whether to show favorites or regular schedules
 * @param {Array} props.favoritedSchedules - Array of favorited schedule objects
 * @param {Array} props.schedules - Array of generated schedule objects
 * @param {Object} props.scrapeState - Schedule generation state object
 * @param {boolean} props.scrapeState.isScraping - Whether generation is in progress
 * @param {string} props.scrapeState.status - Generation status message
 * @param {Set} props.favoritedScheduleStrings - Set of favorited schedule string IDs
 * @param {string|null} props.selectedScheduleId - Currently selected schedule ID
 * @param {Function} props.toggleRenderFavorites - Toggle between schedules and favorites view
 * @param {Function} props.setSelectedSchedule - Select/pin a schedule
 * @param {Function} props.setHoveredSchedule - Set hovered schedule for preview
 * @param {Function} props.clearHoveredSchedule - Clear hovered schedule
 * @param {Function} props.toggleFavoriteSchedule - Toggle favorite status of schedule
 * @param {Function} props.deleteSchedule - Delete a schedule
 * @param {Function} props.getScheduleDisplayNumber - Get display number for schedule
 * @param {Object} props.ss - CSS module styles object
 * @returns {JSX.Element} Schedules list with controls
 */
const SchedulesList = React.memo(({
    renderFavorites, favoritedSchedules, schedules, scrapeState, favoritedScheduleStrings,
    selectedScheduleId, toggleRenderFavorites, setSelectedSchedule, setHoveredSchedule,
    clearHoveredSchedule, toggleFavoriteSchedule, deleteSchedule, getScheduleDisplayNumber, ss
}) => {
    // Determine which schedules to display based on current view mode
    const schedulesToRender = renderFavorites ? favoritedSchedules : schedules;
    const isEmpty = !schedulesToRender?.some(s => s?.length > 0);

    return (
        <div className={ss.schedulesContainer}>
            {/* View Toggle Button */}
            <div className={ss.listActions}>
                <button
                    className={`${ss.toggleButton} ${ss.button} ${renderFavorites ? ss.active : ''}`}
                    onClick={toggleRenderFavorites}>
                    {renderFavorites ? "★ Favorites" : "Show Favorites"}
                </button>
            </div>

            {/* Empty State or Schedule List */}
            {isEmpty ? (
                <div className={ss['empty-message']}>
                    {renderFavorites ? "You have no favorited schedules." :
                     (scrapeState.isScraping ? "Generating..." :
                      (scrapeState.status && scrapeState.status.includes("No matching") ? scrapeState.status : "No schedules have been generated yet." )
                     )
                    }
                </div>
            ) : (
                // Render individual schedule items
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
                            {/* Favorite Toggle Button */}
                            <button
                                className={`${ss['favorite-button']} ${isFavorite ? ss['favorited'] : ''}`}
                                onClick={(e) => { e.stopPropagation(); toggleFavoriteSchedule(schedule, currentScheduleString, isFavorite); }}
                                aria-label={`${isFavorite ? 'Unfavorite' : 'Favorite'} Schedule ${displayNum}`}
                            >
                                {isFavorite ? '★' : '☆'}
                            </button>
                            
                            {/* Schedule Display Number */}
                            <span>Schedule {displayNum}</span>
                            
                            {/* Delete Button */}
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

// === COURSES LIST COMPONENT ===

/**
 * Component for displaying and managing the list of course parameters
 * Shows all course cards and the add course button
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Array} props.classes - Array of course objects
 * @param {Function} props.updateClass - Update course data callback
 * @param {Function} props.deleteClass - Delete course callback
 * @param {Function} props.addClass - Add new course callback
 * @param {Object} props.ss - CSS module styles object
 * @returns {JSX.Element} List of course cards with add button
 */
const ClassesList = React.memo(({ classes, updateClass, deleteClass, addClass, ss }) => (
    <div className={ss.classesContainer}>
        {/* Render all existing course cards */}
        {classes.map((classItem) => (
            <ClassCard
                key={classItem.id}
                classData={classItem}
                onUpdate={updateClass}
                onDelete={deleteClass}
                ss={ss}
            />
        ))}
        {/* Add new course button */}
        <AddClassCard onClick={addClass} ss={ss} />
    </div>
));

// === MAIN COURSE MANAGEMENT PANEL ===

/**
 * Main course management panel component
 * Orchestrates schedule generation, course management, and results display
 * Contains generation controls, parameter toggles, and tabbed interface for schedules/courses
 * 
 * @component
 * @param {Object} props - Component props (extensive prop drilling - see FIXME)
 * @param {Array} props.schedules - Generated schedules array
 * @param {Array} props.favoritedSchedules - Favorited schedules array
 * @param {string|null} props.selectedScheduleId - Currently selected schedule ID
 * @param {Object} props.scrapeState - Schedule generation state
 * @param {boolean} props.scrapeState.isScraping - Whether generation is in progress
 * @param {string} props.scrapeState.status - Generation status message
 * @param {Object} props.paramCheckboxes - Parameter checkbox states
 * @param {boolean} props.paramCheckboxes.box1 - "Open Sections Only" checkbox
 * @param {boolean} props.paramCheckboxes.box2 - "Waitlist OK" checkbox
 * @param {Array} props.classes - Course parameter objects
 * @param {string} props.activeTab - Currently active tab ('schedules' or 'classes')
 * @param {boolean} props.renderFavorites - Whether showing favorites view
 * @param {string|null} props.schedulerError - Error message from scheduler operations
 * @param {Array} props.schedulesStringArray - Array of stringified schedules
 * @param {Set} props.favoritedScheduleStrings - Set of favorited schedule strings
 * @param {Function} props.generateSchedules - Generate new schedules
 * @param {Function} props.clearScrapeStatus - Clear generation status
 * @param {Function} props.toggleFavoriteSchedule - Toggle schedule favorite status
 * @param {Function} props.deleteSchedule - Delete schedule
 * @param {Function} props.setSelectedSchedule - Select/pin schedule
 * @param {Function} props.setHoveredSchedule - Set hovered schedule
 * @param {Function} props.clearHoveredSchedule - Clear hovered schedule
 * @param {Function} props.toggleRenderFavorites - Toggle favorites view
 * @param {Function} props.setActiveTab - Set active tab
 * @param {Function} props.toggleParamCheckbox - Toggle parameter checkbox
 * @param {Function} props.addClass - Add new course
 * @param {Function} props.updateClass - Update course data
 * @param {Function} props.deleteClass - Delete course
 * @param {Function} props.getScheduleDisplayNumber - Get schedule display number
 * @param {Object} props.ss - CSS module styles object
 * @returns {JSX.Element} Complete course management interface
 * 
 * @example
 * <CourseManagementPanel
 *   schedules={schedules}
 *   classes={classes}
 *   activeTab="schedules"
 *   generateSchedules={handleGenerate}
 *   // ... other props
 *   ss={styles}
 * />
 */
//FIXME Reduce prop drilling
const CourseManagementPanel = ({
    schedules, favoritedSchedules, selectedScheduleId, scrapeState, paramCheckboxes,
    classes, activeTab, renderFavorites, schedulerError, schedulesStringArray,
    favoritedScheduleStrings, generateSchedules, clearScrapeStatus, toggleFavoriteSchedule,
    deleteSchedule, setSelectedSchedule, setHoveredSchedule, clearHoveredSchedule,
    toggleRenderFavorites, setActiveTab, toggleParamCheckbox, addClass, updateClass,
    deleteClass, getScheduleDisplayNumber, ss
}) => {
    // Extract scrape state for easier access
    const { isScraping, status: scrapeStatus } = scrapeState;

    return (
        <aside className={ss.controlPanel}>
            {/* === GENERATION CONTROLS SECTION === */}
            <div className={ss.generationControls}>
                {/* Main Generate Button */}
                <button
                    className={`${ss.button} ${ss['button-primary']}`}
                    onClick={generateSchedules}
                    disabled={isScraping || classes.length === 0}
                >
                    {isScraping ? "Generating..." : "Generate Schedules"}
                </button>
                
                {/* Parameter Toggle Buttons */}
                <div className={ss.paramToggles}>
                    <button 
                        className={`${ss.button} ${ss.toggleButton} ${paramCheckboxes.box1 ? ss.active : ''}`} 
                        onClick={() => toggleParamCheckbox('box1')}
                    >
                        Open Sections Only
                    </button>
                    <button 
                        className={`${ss.button} ${ss.toggleButton} ${paramCheckboxes.box2 ? ss.active : ''}`} 
                        onClick={() => toggleParamCheckbox('box2')}
                    >
                        Waitlist OK
                    </button>
                </div>
                
                {/* Loading Indicator - Shown during generation */}
                {isScraping && (
                    <div className={ss['loading-indicator']}>
                        <div className={ss['spinner']}></div>
                        <p>Scraping in progress...</p>
                    </div>
                )}
                
                {/* Status Message - Shown after generation completes */}
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
                
                {/* Additional Error Message - Shown if both scrape status and scheduler error exist */}
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
            
            {/* === TABBED CONTENT SECTION === */}
            <div className={ss.listContainer}>
                {/* Tab Navigation */}
                <div className={ss.listTabs}>
                    <button 
                        className={`${ss.tabButton} ${activeTab === 'schedules' ? ss.active : ''}`} 
                        onClick={() => setActiveTab('schedules')}
                    >
                        Schedules
                    </button>
                    <button 
                        className={`${ss.tabButton} ${activeTab === 'classes' ? ss.active : ''}`} 
                        onClick={() => setActiveTab('classes')}
                    >
                        Courses
                    </button>
                </div>
                
                {/* Tab Content */}
                <div className={ss.listContent}>
                   {/* Schedules Tab - Shows generated schedules and favorites */}
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
                   
                   {/* Courses Tab - Shows course parameter management */}
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