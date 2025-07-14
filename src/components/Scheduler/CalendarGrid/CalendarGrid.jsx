// src/components/CalendarGrid/CalendarGrid.jsx
import React from 'react';
import ss from './CalendarGrid.module.css'; // Styles for grid AND modals
import { Modal, DetailsModal, EventForm } from './CalendarModals'; // Import modals

/** @constant {Array<string>} Day labels for calendar header display */
const dayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
// dayShortLabels, dayIndexToBit, isDaySelected, getDaysFromBitmask moved to CalendarModals.jsx

// === TIME UTILITY FUNCTIONS ===
// Simple time utilities - remain in CalendarGrid as they are used for grid logic & pre-filling form

/**
 * Converts time integer to HH:MM string format
 * @param {number|null|undefined} timeInt - Time as integer (e.g., 930 for 9:30 AM)
 * @returns {string} Formatted time string (e.g., "09:30")
 * 
 * @example
 * intToTimeString(930) // Returns "09:30"
 * intToTimeString(1245) // Returns "12:45"
 * intToTimeString(null) // Returns "00:00"
 */
const intToTimeString = (timeInt) => {
  if (timeInt === null || timeInt === undefined) return '00:00'; // Handle null/undefined better
  const hours = Math.floor(timeInt / 100);
  const minutes = timeInt % 100;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

/**
 * Converts HH:MM time string to integer format
 * @param {string} timeStr - Time string in HH:MM format
 * @returns {number} Time as integer (e.g., 930 for "09:30")
 * 
 * @example
 * timeStringToInt("09:30") // Returns 930
 * timeStringToInt("12:45") // Returns 1245
 * timeStringToInt("invalid") // Returns 0
 */
const timeStringToInt = (timeStr) => {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return isNaN(hours) || isNaN(minutes) ? 0 : hours * 100 + minutes;
};

/**
 * Adds minutes to a time integer and returns new time integer
 * @param {number} timeInt - Original time as integer
 * @param {number} minutesToAdd - Minutes to add (can be negative)
 * @returns {number} New time as integer, minimum 0
 * 
 * @example
 * addMinutesToTimeInt(930, 30) // Returns 1000 (9:30 + 30min = 10:00)
 * addMinutesToTimeInt(1200, 75) // Returns 1315 (12:00 + 75min = 13:15)
 */
const addMinutesToTimeInt = (timeInt, minutesToAdd) => {
  const hours = Math.floor(timeInt / 100);
  const minutes = timeInt % 100;
  const totalMinutes = hours * 60 + minutes + minutesToAdd;
  if (totalMinutes < 0) return 0; // Prevent negative times
  const newHours = Math.floor(totalMinutes / 60);
  const newMinutes = totalMinutes % 60;
  return newHours * 100 + newMinutes;
};

// === EVENT COMPONENT ===

/**
 * Individual event display component within the calendar grid
 * Handles both user events and preview events from schedules
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.event - Event data object
 * @param {string} props.event.id - Unique event identifier
 * @param {string} props.event.title - Event title
 * @param {string} [props.event.professor] - Professor/instructor name
 * @param {boolean} [props.event.isPreview] - Whether this is a preview event from schedule
 * @param {Object} props.eventStyle - CSS styles for positioning and sizing
 * @param {Function} [props.onEdit] - Callback for editing user events
 * @param {Function} [props.onShowDetails] - Callback for showing event details
 * @returns {JSX.Element} Rendered event component
 */
const Event = ({ event, eventStyle, onEdit, onShowDetails }) => {
  /**
   * Handles click events on the event component
   * Preview events show details, user events open edit modal
   * @param {Event} e - Click event
   */
  const handleClick = (e) => {
    e.stopPropagation();
    if (event.isPreview) {
      onShowDetails?.(event);
    } else {
      onEdit?.(event);
    }
  };
  
  // Build CSS classes based on event type and properties
  const eventClasses = [
    ss.event,
    event.professor === '' ? ss.activity : ss.class, // Check if professor is empty string
    event.isPreview ? ss.previewEvent : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={eventClasses} style={eventStyle} onClick={handleClick}>
      <div className={ss['event-header']}>
        <div className={ss['event-title']}>{event.title}</div>
        {/* Removed delete button - deletion only through EventForm modal */}
      </div>
      {event.professor && <div className={ss['event-professor']}>{event.professor}</div>}
    </div>
  );
};

// === MAIN CALENDAR GRID COMPONENT ===

/**
 * Main calendar grid component for displaying and managing events
 * Provides weekly view with time slots, event creation, editing, and preview functionality
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.events - Timed events organized by day key (1-5 for Mon-Fri)
 * @param {Object} [props.noTimeEvents={}] - Events without specific times, organized by day
 * @param {number} [props.startHour=8] - Starting hour for calendar display (24-hour format)
 * @param {number} [props.endHour=20] - Ending hour for calendar display (24-hour format)
 * @param {Function} props.onEventCreate - Callback for creating new events
 * @param {Function} props.onEventDelete - Callback for deleting events
 * @param {Function} props.onEventUpdate - Callback for updating existing events
 * @param {Function} props.onShowDetails - Callback for showing event details
 * @param {Object|null} props.detailsEvent - Event object for details modal
 * @param {Function} props.onCloseDetails - Callback for closing details modal
 * @returns {JSX.Element} Complete calendar grid interface
 */
const CalendarGrid = ({
  events,
  noTimeEvents = {},
  startHour = 8,
  endHour = 20,
  onEventCreate,
  onEventDelete,
  onEventUpdate,
  onShowDetails,
  detailsEvent,
  onCloseDetails,
}) => {
  // === CALENDAR CALCULATIONS ===
  
  /** @type {number} Total hours displayed in calendar */
  const totalHours = endHour - startHour;
  
  /** @type {Array<number>} Array of hour values to display (includes end hour for final grid line) */
  const hoursToDisplay = Array.from({ length: totalHours + 1 }, (_, i) => startHour + i);
  
  /** @type {number} Total minutes in the calendar display range */
  const totalMinutes = totalHours * 60;
  
  // === MODAL STATE MANAGEMENT ===
  
  /**
   * Modal state for event creation/editing
   * @type {Object} Modal state object
   * @property {boolean} isOpen - Whether modal is currently open
   * @property {boolean} isEditing - Whether in edit mode (vs create mode)
   * @property {Object} data - Form data for the event being created/edited
   * @property {string|null} data.id - Event ID (null for new events)
   * @property {string} data.title - Event title
   * @property {string} data.startTime - Start time in HH:MM format
   * @property {string} data.endTime - End time in HH:MM format
   * @property {number} data.day - Day bitmask for selected days
   * @property {string} data.professor - Professor/instructor name
   * @property {string} data.description - Event description
   */
  const [modal, setModal] = React.useState({
    isOpen: false,
    isEditing: false,
    // Data for the form, times stored as "HH:mm" strings
    data: { id: null, title: '', startTime: '', endTime: '', day: 0, professor: '', description: '' }
  });

  // === EVENT HANDLERS ===

  /**
   * Calculates time from click position within a calendar column
   * Snaps to 15-minute intervals for better UX
   * @param {number} yPos - Y position of click relative to column top
   * @param {number} columnHeight - Total height of the calendar column
   * @returns {string} Time string in HH:MM format
   */
  const getTimeFromPosition = (yPos, columnHeight) => {
    const percentageDown = yPos / columnHeight;
    const minutesSinceStart = Math.floor(percentageDown * totalMinutes);
    const hours = Math.floor(minutesSinceStart / 60) + startHour;
    const minutes = Math.floor((minutesSinceStart % 60) / 15) * 15; // Snap to 15 mins
    return intToTimeString(hours * 100 + minutes);
  };

  /**
   * Handles clicks on empty time slots to create new events
   * Opens modal with pre-filled time based on click position
   * @param {Event} e - Click event
   * @param {number} dayUiIndex - Day index (0 for Mon, 1 for Tue, etc.)
   */
  const handleTimeSlotClick = (e, dayUiIndex) => { // dayUiIndex is 0 for Mon, 1 for Tue etc.
    const columnRect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - columnRect.top;
    const clickTimeStr = getTimeFromPosition(relativeY, columnRect.height);
    const clickTimeInt = timeStringToInt(clickTimeStr);
    const endTimeStr = intToTimeString(addMinutesToTimeInt(clickTimeInt, 60)); // Default 1 hour duration

    setModal({
      isOpen: true,
      isEditing: false,
      data: {
        id: null, // New event won't have an ID yet
        title: '',
        startTime: clickTimeStr,
        endTime: endTimeStr,
        day: 1 << (dayUiIndex + 1), // Bitmask for the clicked day
        professor: '',
        description: ''
      }
    });
  };

  /**
   * Opens edit modal for an existing event
   * Converts event data to form-compatible format
   * @param {Object} eventToEdit - Event object to edit
   */
  const handleEditEvent = (eventToEdit) => {
    setModal({
      isOpen: true,
      isEditing: true,
      data: { // Ensure all fields are present and times are "HH:mm" strings
        id: eventToEdit.id,
        title: eventToEdit.title,
        startTime: typeof eventToEdit.startTime === 'number' ? intToTimeString(eventToEdit.startTime) : eventToEdit.startTime,
        endTime: typeof eventToEdit.endTime === 'number' ? intToTimeString(eventToEdit.endTime) : eventToEdit.endTime,
        day: eventToEdit.day,
        professor: eventToEdit.professor || '', // Ensure it's a string
        description: eventToEdit.description || '' // Ensure it's a string
      }
    });
  };

  /**
   * Saves event data (create or update) and closes modal
   * Validates required fields before saving
   * Converts time strings back to integers for backend compatibility
   */
  const handleSaveEvent = () => {
    const { data, isEditing } = modal;
    if (data.title && data.startTime && data.endTime && data.day !== 0) {
      const eventToSave = {
        ...data,
        // Convert times back to integers for saving/backend
        startTime: timeStringToInt(data.startTime),
        endTime: timeStringToInt(data.endTime),
      };

      if (isEditing && data.id) { // data.id should exist if editing
        onEventUpdate(eventToSave);
      } else {
        onEventCreate(eventToSave);
      }
      
      handleCloseModal(); // Close modal after save
    }
  };

  /**
   * Closes modal and resets form data to initial state
   */
  const handleCloseModal = () => {
    setModal({
      isOpen: false,
      isEditing: false,
      data: { id: null, title: '', startTime: '', endTime: '', day: 0, professor: '', description: '' }
    });
  };

  /**
   * Handles event deletion from the edit form
   * Waits for deletion confirmation and only closes modal on success
   * @param {string|number} eventId - ID of event to delete
   * @returns {Promise<void>}
   * @async
   */
  const handleDeleteFromForm = async (eventId) => {
    try {
      // Wait for the deletion to complete (including user confirmation)
      await onEventDelete(eventId);
      // Only close modal after successful deletion
      handleCloseModal();
    } catch (error) {
      // If deletion fails or user cancels, keep modal open
      console.error('Deletion failed or was cancelled:', error);
      // Modal stays open so user can try again or cancel
    }
  };

  // === RENDER ===

  return (
    <div className={ss['calendar-container']}>
      <div className={ss['calendar-grid']}>
        {/* Calendar Header Row */}
        <div className={ss['header-spacer']} />
        {dayLabels.map(day => (
          <div key={day} className={ss['header-cell']}>
            <span>{day}</span>
          </div>
        ))}

        {/* Main Calendar Content Area */}
        <div className={ss['time-slots-container']}>
          {/* Time Labels Column */}
          <div className={ss['time-labels-column']}>
            {/* no-time-bar equivalent is handled by timed-labels-area starting below header */}
            <div className={ss['timed-labels-area']}>
              {hoursToDisplay.map((hour, i) => (
                <div key={hour} className={ss['hour-label']}>
                  {/* Display label for all but the last conceptual "line" (endHour itself) */}
                  {i < hoursToDisplay.length -1 ? <span>{`${hour}:00`}</span> : <span />}
                </div>
              ))}
            </div>
          </div>

          {/* Day Columns */}
          {dayLabels.map((_, dayUiIndex) => { // dayUiIndex from 0 (Mon) to 4 (Fri)
            const dayKeyForMap = (dayUiIndex + 1).toString(); // Backend/processing uses 1-based dayKey
            const eventsForThisColumn = events[dayKeyForMap] || [];
            const noTimeEventsForThisColumn = noTimeEvents[dayKeyForMap] || [];

            return (
              <div key={dayUiIndex} className={ss['day-column']}>
                {/* No-Time Events Bar (appears above timed area) */}
                {noTimeEventsForThisColumn.length > 0 && (
                  <div className={ss['no-time-bar']}>
                    {noTimeEventsForThisColumn.map((event, idx) => (
                      <div 
                        key={event.id || `notime-${idx}`} 
                        className={ss['no-time-event']}
                        onClick={(e) => {
                           e.stopPropagation();
                           // If it's a preview event from a schedule, show details
                           // Otherwise, if it's a user-created no-time event, allow editing
                           if (event.isPreview) onShowDetails?.(event);
                           else handleEditEvent(event);
                        }}
                      >
                        {event.title}
                      </div>
                    ))}
                  </div>
                )}

                {/* Timed Events Area */}
                <div className={ss['timed-area']} onClick={(e) => handleTimeSlotClick(e, dayUiIndex)}>
                  {/* Grid Lines and Half-Hour Markers */}
                  {hoursToDisplay.map((hour, i) => (
                    <React.Fragment key={hour}>
                      <div className={ss['grid-line']} style={{ top: `${(i / totalHours) * 100}%` }} />
                      {i < hoursToDisplay.length - 1 && ( // Add half-hour lines except for the last hour
                        <div
                          className={ss['half-hour-dotted-line']}
                          style={{ top: `${((i + 0.5) / totalHours) * 100}%` }}
                        />
                      )}
                    </React.Fragment>
                  ))}
                  
                  {/* Timed Events */}
                  {eventsForThisColumn.map((event, eventIndexInColumn) => (
                    <Event 
                      key={event.id} 
                      event={event}
                      eventStyle={{
                        top: event.topPosition,
                        height: event.heightPosition,
                        width: event.width,
                        left: event.left,
                        // zIndex based on if it's a preview or regular event
                        zIndex: event.isPreview ? (eventIndexInColumn + 1000) : (eventIndexInColumn + 1)
                      }}
                      // Removed onDelete prop - deletion only through EventForm modal
                      onEdit={handleEditEvent}
                      onShowDetails={onShowDetails}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Form Modal: For Creating/Editing Events */}
        <Modal isOpen={modal.isOpen} onClose={handleCloseModal} styles={ss}>
          <EventForm 
            event={modal.data}
            setEvent={(updater) => setModal(prev => ({ 
              ...prev, 
              data: typeof updater === 'function' ? updater(prev.data) : updater 
            }))}
            onSave={handleSaveEvent}
            onCancel={handleCloseModal}
            onDelete={handleDeleteFromForm} // Now async - waits for deletion to complete
            isEditing={modal.isEditing}
            styles={ss}
          />
        </Modal>

        {/* Details Modal: For Showing Preview Event Details */}
        <DetailsModal
          isOpen={!!detailsEvent}
          event={detailsEvent}
          onClose={onCloseDetails}
          styles={ss}
        />
      </div>
    </div>
  );
};

export default CalendarGrid;