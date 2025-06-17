// src/components/CalendarGrid/CalendarGrid.jsx
import React from 'react';
import { parse, format, addMinutes } from 'date-fns';
import ss from './CalendarGrid.module.css';
import { Trash2, X } from 'lucide-react';

// ... Day constants and helpers ...
const dayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const dayShortLabels = ['M', 'Tu', 'W', 'Th', 'F'];
const dayIndexToBit = (index) => 1 << (index + 1);
const isDaySelected = (dayBits, dayIndex) => (dayBits & (1 << (dayIndex + 1))) !== 0;

// Helper function to convert "HH:mm" string to HHmm integer
const hhmmStringToInt = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) {
        // console.error("Invalid time string for hhmmStringToInt:", timeStr);
        return 0; // Default or error value
    }
    const parts = timeStr.split(':');
    if (parts.length !== 2) return 0;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return 0;
    return hours * 100 + minutes;
};

// Helper for DetailsModal: converts bitmask to readable day string
const getDaysFromBitmask = (dayBitmask) => {
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    if (!dayBitmask || dayBitmask === 0) return 'No scheduled days';
    return dayNames
      .filter((_, index) => (dayBitmask & (1 << (index + 1))) !== 0)
      .join(', ');
};

const DayCheckbox = ({ day, index, checked, onChange }) => (
  <label 
    className={`${ss['day-checkbox']} ${checked ? ss.selected : ''}`}
    key={day}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={() => onChange(index)}
    />
    <span className={ss['days-text']}>{day}</span>
  </label>
);
  
const Modal = ({ isOpen, onClose, children }) => {
  return (
    <div 
      className={`${ss['slide-modal-container']} ${isOpen ? ss['modal-open'] : ''}`}
      onClick={onClose}
    >
      <div 
        className={ss['slide-modal']}
        onClick={e => e.stopPropagation()}
      >
        <button 
          className={ss['close-button']} 
          onClick={onClose}
          aria-label="Close modal"
        >
          <X size={20} />
        </button>
        {children}
      </div>
    </div>
  );
};

const DetailsModal = ({ isOpen, onClose, event }) => {
    if (!event) {
        return null;
    }

    // FIX: The event properties are pre-formatted strings. Use them directly.
    // A time of "00:00" from a preview/processed event usually means N/A (e.g., async class).
    const displayTime = (event.startTime === '00:00' && event.endTime === '00:00')
        ? 'N/A' 
        : `${event.startTime} - ${event.endTime}`;

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className={ss['modal-header']}>
                <h2 className={ss['modal-title']}>{event.title}</h2>
            </div>
            <div className={ss['form-grid']}> {/* Reusing existing class for layout */}
                <div className={ss['form-row']}>
                    <label className={ss['form-label']}>Time</label>
                    <p>{displayTime}</p>
                </div>
                <div className={ss['form-row']}>
                    <label className={ss['form-label']}>Days</label>
                    <p>{getDaysFromBitmask(event.day)}</p>
                </div>
                {event.professor && (
                    <div className={ss['form-row']}>
                        <label className={ss['form-label']}>Professor</label>
                        <p>{event.professor}</p>
                    </div>
                )}
                {event.description && (
                    <div className={ss['form-row']}>
                        <label className={ss['form-label']}>Description</label>
                        <p style={{whiteSpace: 'pre-wrap', wordBreak: 'break-word'}}>{event.description}</p>
                    </div>
                )}
            </div>
            <div className={ss['button-container']} style={{justifyContent: 'flex-end'}}>
                 <button 
                    className={`${ss.button} ${ss['button-primary']}`}
                    onClick={onClose}
                 >
                    Close
                </button>
            </div>
        </Modal>
    );
};


const EventForm = ({ event, setEvent, onSave, onCancel, onDelete, isEditing = false }) => {
  const handleDayToggle = (dayIndex) => {
    const dayBit = dayIndexToBit(dayIndex);
    setEvent(prev => ({
      ...prev,
      day: prev.day ^ dayBit 
    }));
  };

  const handleDelete = async () => {
    const confirmed = await new Promise((resolve) => {
      const result = window.confirm('Are you sure you want to delete this event?');
      resolve(result);
    });
    
    if (confirmed && onDelete) {
      onDelete(event.id); // event.id is passed
      onCancel(); 
    }
  };

  return (
    <>
      <div className={ss['modal-header']}>
        <h2 className={ss['modal-title']}>{isEditing ? 'Edit Event' : 'New Event'}</h2>
      </div>
      <div className={ss['form-grid']}>
        <div className={ss['form-row']}>
          <label className={ss['form-label']}>Title*</label>
          <input
            type="text"
            className={ss['form-input']}
            value={event.title} // Expects string
            onChange={(e) => setEvent({ ...event, title: e.target.value })}
          />
        </div>
        <div className={ss['form-row']}>
          <label className={ss['form-label']}>Days*</label>
          <div className={ss['days-grid']}>
            {dayShortLabels.map((day, index) => (
              <DayCheckbox
                key={day}
                day={day}
                index={index}
                checked={isDaySelected(event.day, index)}
                onChange={handleDayToggle}
              />
            ))}
          </div>
        </div>
        <div className={ss['form-row']}>
          <label className={ss['form-label']}>Time*</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="time"
              className={ss['form-input']}
              value={event.startTime} // Expects "HH:mm" string
              onChange={(e) => setEvent({ ...event, startTime: e.target.value })}
              style={{ width: '50%' }}
              onClick={(e) => e.stopPropagation()}
            />
            <input
              type="time"
              className={ss['form-input']}
              value={event.endTime} // Expects "HH:mm" string
              onChange={(e) => setEvent({ ...event, endTime: e.target.value })}
              style={{ width: '50%' }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
        <div className={ss['form-row']}>
          <label className={ss['form-label']}>Professor</label>
          <input
            type="text"
            className={ss['form-input']}
            value={event.professor}
            onChange={(e) => setEvent({ ...event, professor: e.target.value })}
          />
        </div>
        <div className={ss['form-row']}>
          <label className={ss['form-label']}>Description</label>
          <textarea
            className={ss['form-textarea']}
            value={event.description}
            onChange={(e) => setEvent({ ...event, description: e.target.value })}
            placeholder="Add event description..."
          />
        </div>
      </div>
      <div className={isEditing ? ss['button-container-stacked'] : ss['button-container']}>
        {isEditing && (
          <button 
            className={`${ss.button} ${ss['button-danger']} ${ss['full-width']}`}
            onClick={handleDelete}
          >
            Delete Event
          </button>
        )}
        <div className={ss['action-buttons']}>
          <button 
            className={`${ss.button} ${ss['button-outline']}`}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button 
            className={`${ss.button} ${ss['button-primary']}`}
            onClick={onSave} // onSave will handle conversion from string to int
            disabled={!event.title || !event.startTime || !event.endTime || event.day === 0}
          >
            {isEditing ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </>
  );
};

const Event = ({ event, eventStyle, onDelete, onEdit, onShowDetails }) => {
  const asyncConfirm = async (message) => {
    return new Promise((resolve) => {
      const result = window.confirm(message);
      resolve(result); 
    });
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (event.isPreview) {
        if(onShowDetails) {
            onShowDetails(event);
        }
    } else { 
        if(onEdit) {
            onEdit(event); 
        }
    }
  };
  
  const handleDelete = async (e) => {
    e.stopPropagation(); 
    if (event.isPreview) { // Button not rendered anyway, but good practice
        return;
    }
  
    const confirmed = await asyncConfirm('Are you sure you want to delete this event?'); 
    if (!confirmed) {
        return; 
    }
  
    try {
      onDelete(event.id); 
    } catch (err) {
      console.error('Error deleting event:', err); 
      alert('Failed to delete event. Please try again.'); 
    }
  };
  
  const eventClasses = [
    ss.event,
    event.professor === '' ? ss.activity : ss.class,
    event.isPreview ? ss.previewEvent : '' 
  ].filter(Boolean).join(' ');

  return (
    <div
      className={eventClasses} 
      style={eventStyle}
      onClick={handleClick}
    >
      <div className={ss['event-header']}>
        <div className={ss['event-title']}>{event.title}</div>
        {!event.isPreview && ( 
            <button 
              className={ss['delete-button']}
              onClick={handleDelete}
              aria-label="Delete event"
            >
              <Trash2 size={16} />
            </button>
        )}
      </div>
      {event.professor && (
        <div className={ss['event-professor']}>
          {event.professor}
        </div>
      )}
    </div>
  );
};

const defaultEventState = { // For EventForm
  id: null, // Important for distinguishing new vs edit
  title: '',
  startTime: '', // "HH:mm" string for form input
  endTime: '',   // "HH:mm" string for form input
  day: 0, 
  professor: '',
  description: ''
};

const CalendarGrid = ({
    events, // eventsByDay
    noTimeEvents = {}, // new prop
    startHour = 8,
    endHour = 20,
    onEventCreate,
    onEventDelete,
    onEventUpdate,
    onShowDetails,
    detailsEvent,
    onCloseDetails,
}) => {
    const totalHours = endHour - startHour;
    const hoursToDisplay = Array.from({ length: totalHours + 1 }, (_, i) => startHour + i);
    const totalMinutes = totalHours * 60;
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [editingEvent, setEditingEvent] = React.useState(null); // Stores the original event being edited
    const [newEventData, setNewEventData] = React.useState({...defaultEventState}); // Data for the form
  
    const parseTimeFromString = (timeStr) => parse(timeStr, 'HH:mm', new Date()); // Renamed for clarity
  
    const getTimeFromPosition = (yPos, columnHeight) => {
      const percentageDown = yPos / columnHeight;
      const minutesSinceStart = Math.floor(percentageDown * totalMinutes);
      const hours = Math.floor(minutesSinceStart / 60) + startHour;
      const minutes = Math.floor((minutesSinceStart % 60) / 15) * 15; // Snap to 15 min
      return format(new Date(0).setHours(hours, minutes), 'HH:mm'); // Use new Date(0) for date-fns v2+
    };
  
    const handleTimeSlotClick = (e, dayUiIndex) => {
      // e.currentTarget is now the `timed-area` div
      const columnRect = e.currentTarget.getBoundingClientRect();
      const relativeY = e.clientY - columnRect.top;
      const clickTimeStr = getTimeFromPosition(relativeY, columnRect.height); // "HH:mm"
      const endTimeStr = format(addMinutes(parseTimeFromString(clickTimeStr), 60), 'HH:mm'); // "HH:mm"
  
      setEditingEvent(null); // Not editing an existing event
      setNewEventData({ // Populate form data
        ...defaultEventState,
        startTime: clickTimeStr, // "HH:mm" string
        endTime: endTimeStr,     // "HH:mm" string
        day: dayIndexToBit(dayUiIndex),
      });
      setIsModalOpen(true);
    };
  
    const handleEditEvent = (eventToEdit) => { // eventToEdit comes from processEvents (times are "HH:mm" strings)
      setEditingEvent(eventToEdit); // Store the original event
      setNewEventData({ // Populate form with string times from eventToEdit
        id: eventToEdit.id,
        title: eventToEdit.title,
        startTime: eventToEdit.startTime, // Already "HH:mm" string from processEvents
        endTime: eventToEdit.endTime,   // Already "HH:mm" string from processEvents
        day: eventToEdit.day,
        professor: eventToEdit.professor,
        description: eventToEdit.description,
      }); 
      setIsModalOpen(true);
    };
  
    const handleSaveEvent = () => {
      // newEventData contains "HH:mm" strings for startTime and endTime from the form
      if (
          newEventData.title &&
          newEventData.startTime &&
          newEventData.endTime &&
          newEventData.day !== 0
      ) {
        const eventToSave = {
          ...newEventData,
          // Convert "HH:mm" strings to HHmm integers before passing to onEventCreate/Update
          startTime: hhmmStringToInt(newEventData.startTime),
          endTime: hhmmStringToInt(newEventData.endTime),
        };

        if (editingEvent && editingEvent.id) { // If editingEvent has an ID, it's an update
          onEventUpdate(eventToSave); // Pass event with integer times
        } else {
          onEventCreate(eventToSave); // Pass event with integer times
        }
        setIsModalOpen(false);
        setNewEventData({...defaultEventState});
        setEditingEvent(null);
      }
    };
  
    const handleCloseModal = () => {
      setIsModalOpen(false);
      setEditingEvent(null);
      setNewEventData({...defaultEventState});
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
              <div className={ss['timed-labels-area']}>
                {hoursToDisplay.map((hour, i) => (
                  <div key={hour} className={ss['hour-label']}>
                    {/* Don't render the last hour label (e.g., 20:00) */}
                    {i < hoursToDisplay.length - 1 ? (
                      <span>{`${hour}:00`}</span>
                    ) : (
                      <span /> // Empty span for spacing
                    )}
                  </div>
                ))}
              </div>
            </div>
  
            {dayLabels.map((_, dayUiIndex) => {
              const dayKeyForMap = (dayUiIndex + 1).toString(); 
              const eventsForThisColumn = events[dayKeyForMap] || [];
              const noTimeEventsForThisColumn = noTimeEvents[dayKeyForMap] || [];

              return (
                <div key={dayUiIndex} className={ss['day-column']}>
                  {noTimeEventsForThisColumn.length > 0 && (
                    <div className={ss['no-time-bar']}>
                      {noTimeEventsForThisColumn.map((event, idx) => (
                        <div key={event.id || idx} className={ss['no-time-event']}>
                          {event.title}
                        </div>
                      ))}
                    </div>
                  )}

                  <div 
                    className={ss['timed-area']}
                    onClick={(e) => handleTimeSlotClick(e, dayUiIndex)}
                  >
                    {hoursToDisplay.map((hour, i) => (
                      <React.Fragment key={hour}>
                        <div
                          className={ss['grid-line']}
                          style={{ top: `${(i / totalHours) * 100}%` }}
                        />
                        {i < hoursToDisplay.length - 1 && (
                          <div
                            className={ss['half-hour-dotted-line']}
                            style={{
                              top: `${((i + 0.5) / totalHours) * 100}%`,
                            }}
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
                          zIndex: event.isPreview ? (eventIndexInColumn + 10000) : (eventIndexInColumn + 1)
                        }}
                        onDelete={onEventDelete}
                        onEdit={handleEditEvent}
                        onShowDetails={onShowDetails}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
  
          <Modal isOpen={isModalOpen} onClose={handleCloseModal}>
            <EventForm 
              event={newEventData}
              setEvent={setNewEventData}
              onSave={handleSaveEvent}
              onCancel={handleCloseModal}
              onDelete={onEventDelete}
              isEditing={!!(editingEvent && editingEvent.id)}
            />
          </Modal>

          <DetailsModal
            isOpen={!!detailsEvent}
            event={detailsEvent}
            onClose={onCloseDetails}
          />
        </div>
      </div>
    );
  };

export default CalendarGrid;