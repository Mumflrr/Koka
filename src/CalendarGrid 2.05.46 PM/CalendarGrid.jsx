// src/components/CalendarGrid/CalendarGrid.jsx
import React from 'react';
import ss from './CalendarGrid.module.css'; // Styles for grid AND modals
import { Modal, DetailsModal, EventForm } from './CalendarModals'; // Import modals

const dayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
// dayShortLabels, dayIndexToBit, isDaySelected, getDaysFromBitmask moved to CalendarModals.jsx

// Simple time utilities - remain in CalendarGrid as they are used for grid logic & pre-filling form
const intToTimeString = (timeInt) => {
  if (timeInt === null || timeInt === undefined) return '00:00'; // Handle null/undefined better
  const hours = Math.floor(timeInt / 100);
  const minutes = timeInt % 100;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

const timeStringToInt = (timeStr) => {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return isNaN(hours) || isNaN(minutes) ? 0 : hours * 100 + minutes;
};

const addMinutesToTimeInt = (timeInt, minutesToAdd) => {
  const hours = Math.floor(timeInt / 100);
  const minutes = timeInt % 100;
  const totalMinutes = hours * 60 + minutes + minutesToAdd;
  if (totalMinutes < 0) return 0; // Prevent negative times
  const newHours = Math.floor(totalMinutes / 60);
  const newMinutes = totalMinutes % 60;
  return newHours * 100 + newMinutes;
};

// Event component - removed delete button entirely, deletion only through EventForm modal
const Event = ({ event, eventStyle, onEdit, onShowDetails }) => {
  const handleClick = (e) => {
    e.stopPropagation();
    if (event.isPreview) {
      onShowDetails?.(event);
    } else {
      onEdit?.(event);
    }
  };
  
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

const CalendarGrid = ({
  events, // Expects processed events: { "1": [eventObj, ...], "2": [...] }
  noTimeEvents = {}, // Expects { "1": [eventObj, ...], "2": [...] }
  startHour = 8,
  endHour = 20,
  onEventCreate,
  onEventDelete,
  onEventUpdate,
  onShowDetails,      // Prop for showing details of preview events
  detailsEvent,       // Prop for the event to show in details modal
  onCloseDetails,     // Prop to close details modal
}) => {
  const totalHours = endHour - startHour;
  const hoursToDisplay = Array.from({ length: totalHours + 1 }, (_, i) => startHour + i);
  const totalMinutes = totalHours * 60;
  
  const [modal, setModal] = React.useState({
    isOpen: false,
    isEditing: false,
    // Data for the form, times stored as "HH:mm" strings
    data: { id: null, title: '', startTime: '', endTime: '', day: 0, professor: '', description: '' }
  });

  const getTimeFromPosition = (yPos, columnHeight) => {
    const percentageDown = yPos / columnHeight;
    const minutesSinceStart = Math.floor(percentageDown * totalMinutes);
    const hours = Math.floor(minutesSinceStart / 60) + startHour;
    const minutes = Math.floor((minutesSinceStart % 60) / 15) * 15; // Snap to 15 mins
    return intToTimeString(hours * 100 + minutes);
  };

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

  const handleCloseModal = () => {
    setModal({
      isOpen: false,
      isEditing: false,
      data: { id: null, title: '', startTime: '', endTime: '', day: 0, professor: '', description: '' }
    });
  };

  // Make this function async and await the deletion
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

  return (
    <div className={ss['calendar-container']}>
      <div className={ss['calendar-grid']}>
        <div className={ss['header-spacer']} />
        {dayLabels.map(day => (
          <div key={day} className={ss['header-cell']}>
            <span>{day}</span>
          </div>
        ))}

        <div className={ss['time-slots-container']}>
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

          {dayLabels.map((_, dayUiIndex) => { // dayUiIndex from 0 (Mon) to 4 (Fri)
            const dayKeyForMap = (dayUiIndex + 1).toString(); // Backend/processing uses 1-based dayKey
            const eventsForThisColumn = events[dayKeyForMap] || [];
            const noTimeEventsForThisColumn = noTimeEvents[dayKeyForMap] || [];

            return (
              <div key={dayUiIndex} className={ss['day-column']}>
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

                <div className={ss['timed-area']} onClick={(e) => handleTimeSlotClick(e, dayUiIndex)}>
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