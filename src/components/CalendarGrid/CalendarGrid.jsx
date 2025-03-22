// CalendarGrid.js
import React from 'react';
import { parse, format, addMinutes } from 'date-fns';
import ss from './CalendarGrid.module.css';
import { Trash2, X } from 'lucide-react';

// Day constants for bitwise operations
const DAYS = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6
};

// Display names for each day
const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const dayShortLabels = ['M', 'Tu', 'W', 'Th', 'F']; 

// Helper function to convert day index to bit flag
const dayIndexToBit = (index) => 1 << (index + 1); // +1 because our UI uses Monday as first day (index 0), but bit 0 is Sunday

// Helper function to check if a day bit is set in the day integer
const isDaySelected = (dayBits, dayIndex) => {
  return (dayBits & (1 << (dayIndex + 1))) !== 0; // +1 because index 0 in UI is Monday (bit 1)
};

// Helper function to get readable day labels from day bits
const getDayLabelsFromBits = (dayBits) => {
  return dayShortLabels.filter((_, index) => isDaySelected(dayBits, index)).join(', ');
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

// Updated to display days as comma-separated list for multi-day events
const EventInfoDisplay = ({ event, onClose, onDelete }) => {
  // Get readable day names for display
  // Get readable day names for display
  const eventDays = getDayLabelsFromBits(event.day);
  
  const handleDelete = async () => {
    const confirmed = await new Promise((resolve) => {
      const result = window.confirm('Are you sure you want to delete this event?');
      resolve(result);
    });
    
    if (confirmed) {
      onDelete(event.id);
      onClose(); // Close the modal after deletion
    }
  };
  
  return (
    <>
      <div className={ss['modal-header']}>
        <h2 className={ss['modal-title']}>{event.title}</h2>
      </div>
      <div className={ss['form-grid']}>
        <div className={ss['form-row']}>
          <label className={ss['form-label']}>Days</label>
          <div className={ss['info-text']}>{eventDays}</div>
        </div>
        <div className={ss['form-row']}>
          <label className={ss['form-label']}>Time</label>
          <div className={ss['info-text']}>{event.startTime} - {event.endTime}</div>
        </div>
        {event.professor && (
          <div className={ss['form-row']}>
            <label className={ss['form-label']}>Professor</label>
            <div className={ss['info-text']}>{event.professor}</div>
          </div>
        )}
        {event.description && (
          <div className={ss['form-row']}>
            <label className={ss['form-label']}>Description</label>
            <div className={ss['info-text']}>{event.description}</div>
          </div>
        )}
      </div>
      <div className={ss['button-container']}>
        <button 
          className={`${ss.button} ${ss['button-danger']}`}
          onClick={handleDelete}
        >
          Delete Event
        </button>
        <button 
          className={`${ss.button} ${ss['button-primary']}`}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </>
  );
};

const EventForm = ({ newEvent, setNewEvent, onSave, onCancel }) => {
  // Updated to handle bit flag for days
  const handleDayToggle = (dayIndex) => {
    const dayBit = dayIndexToBit(dayIndex);
    setNewEvent(prev => ({
      ...prev,
      day: prev.day ^ dayBit // XOR to toggle the bit
    }));
  };

  return (
    <>
      <div className={ss['form-grid']}>
        <div className={ss['form-row']}>
          <label className={ss['form-label']}>Title*</label>
          <input
            type="text"
            className={ss['form-input']}
            value={newEvent.title}
            onChange={(e) => setNewEvent({...newEvent, title: e.target.value})}
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
                checked={isDaySelected(newEvent.day, index)}
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
              value={newEvent.startTime}
              onChange={(e) => setNewEvent({...newEvent, startTime: e.target.value})}
              style={{ width: '50%' }}
              onClick={(e) => e.stopPropagation()}
            />
            <input
              type="time"
              className={ss['form-input']}
              value={newEvent.endTime}
              onChange={(e) => setNewEvent({...newEvent, endTime: e.target.value})}
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
            value={newEvent.professor}
            onChange={(e) => setNewEvent({...newEvent, professor: e.target.value})}
          />
        </div>
        <div className={ss['form-row']}>
          <label className={ss['form-label']}>Description</label>
          <textarea
            className={ss['form-textarea']}
            value={newEvent.description}
            onChange={(e) => setNewEvent({...newEvent, description: e.target.value})}
            placeholder="Add event description..."
          />
        </div>
      </div>
      <div className={ss['button-container']}>
        <button 
          className={`${ss.button} ${ss['button-outline']}`}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button 
          className={`${ss.button} ${ss['button-primary']}`}
          onClick={onSave}
          disabled={!newEvent.title || !newEvent.startTime || !newEvent.endTime || newEvent.day === 0}
        >
          Create
        </button>
      </div>
    </>
  );
};

const Event = ({ event, eventStyle, onDelete, onInfoOpen }) => {
  const [eventCreated, setEventCreated] = React.useState(false);
  
  const asyncConfirm = async (message) => {
    return new Promise((resolve) => {
      const result = window.confirm(message);
      resolve(result); // Resolve the promise with the user's choice
    });
  };

  const openInfo = (e) => {
    e.stopPropagation();
    onInfoOpen(event); // Pass the event to the parent component
  };
  
  const handleDelete = async (e) => {
    e.stopPropagation(); // Prevent parent click handlers
  
    const confirmed = await asyncConfirm('Are you sure you want to delete this event?'); // Await user's choice
    if (!confirmed) return; // Exit early if the user cancels
  
    try {
      setEventCreated(true);
      onDelete(event.id); // Notify parent about deletion
      setEventCreated(false);
    } catch (err) {
      console.error('Error deleting event:', err); // Log error
      alert('Failed to delete event. Please try again.'); // Inform user
    }
  };
  
  // Get comma-separated list of days for multi-day events
  const eventDays = getDayLabelsFromBits(event.day);

  return (
    <div
      className={`${ss.event} ${event.professor === '' ? ss.activity : ss.class}`}
      style={eventStyle}
      onClick={openInfo}
    >
      <div className={ss['event-header']}>
        <div className={ss['event-title']}>{event.title}</div>
        <button 
          className={ss['delete-button']}
          onClick={handleDelete}
          aria-label="Delete event"
        >
          <Trash2 size={16} />
        </button>
      </div>
      <div className={ss['event-time']}>
        {event.startTime} - {event.endTime}
      </div>
      {event.professor !== '' && (
        <div className={ss['event-professor']}>
          {event.professor}
        </div>
      )}
    </div>
  );
};

const defaultEventState = {
  title: '',
  startTime: '',
  endTime: '',
  day: 0, // Using bits instead of selectedDays array
  professor: '',
  description: ''
};

const CalendarGrid = ({ events, startHour = 8, endHour = 20, onEventCreate, onEventDelete }) => {
    const totalMinutes = (endHour - startHour) * 60;
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [isInfoOpen, setIsInfoOpen] = React.useState(false);
    const [selectedEvent, setSelectedEvent] = React.useState(null);
    const [newEvent, setNewEvent] = React.useState({...defaultEventState});
  
    const parseTime = (timeStr) => parse(timeStr, 'HH:mm', new Date());
  
    const getTimeFromPosition = (yPos, columnHeight) => {
      const percentageDown = yPos / columnHeight;
      const minutesSinceStart = Math.floor(percentageDown * totalMinutes);
      const hours = Math.floor(minutesSinceStart / 60) + startHour;
      const minutes = Math.floor((minutesSinceStart % 60) / 15) * 15;
      return format(new Date().setHours(hours, minutes), 'HH:mm');
    };
  
    const handleTimeSlotClick = (e, dayIndex) => {
      const columnRect = e.currentTarget.getBoundingClientRect();
      const relativeY = e.clientY - columnRect.top;
      const clickTime = getTimeFromPosition(relativeY, columnRect.height);
      const endTime = format(addMinutes(parseTime(clickTime), 60), 'HH:mm');
  
      setNewEvent({
        ...defaultEventState,
        startTime: clickTime,
        endTime: endTime,
        day: dayIndexToBit(dayIndex), // Initialize with clicked day as bit
      });
      setIsModalOpen(true);
    };
  
    const handleEventClick = (event) => {
      setSelectedEvent(event);
      setIsInfoOpen(true);
    };
  
    const handleSaveEvent = () => {
      if (newEvent.title && newEvent.startTime && newEvent.endTime && newEvent.day !== 0) {
        // Now we can create a single event with multiple days encoded in the day property
        onEventCreate(newEvent);
        
        setIsModalOpen(false);
        setNewEvent({...defaultEventState});
      }
    };
  
    // Ensure events are displayed correctly by using event ID as key instead of title-based key
    return (
      <div className={ss['calendar-container']}>
        <div className={ss['calendar-grid']}>
          {/* Header and time slots remain unchanged */}
          <div className={ss['header-spacer']} />
          {dayLabels.map(day => (
            <div key={day} className={ss['header-cell']}>
              <span>{day}</span>
            </div>
          ))}
  
          <div className={ss['time-slots-container']}>
            <div className={ss['time-labels-column']}>
              {Array.from({ length: endHour - startHour + 1 }).map((_, i) => (
                <div key={i} className={ss['hour-label']}>
                  <span>{`${startHour + i}:00`}</span>
                </div>
              ))}
            </div>
  
            {dayLabels.map((_, dayIndex) => (
              <div 
                key={dayIndex} 
                className={ss['day-column']}
                onClick={(e) => handleTimeSlotClick(e, dayIndex)}
              >
                {Array.from({ length: (endHour - startHour) * 2 }).map((_, i) => (
                  <div key={i} className={ss['grid-line']} />
                ))}
                
                {/* Modified to use event.id as a unique key */}
                {events
                  .filter(event => isDaySelected(event.day, dayIndex))
                  .map((event, eventIndex) => (
                    <Event 
                      key={`${event.id}-${dayIndex}`}
                      event={event}
                      eventStyle={{
                        top: event.topPosition,
                        height: event.heightPosition,
                        width: event.width,
                        left: event.left,
                        zIndex: eventIndex + 1
                      }}
                      onDelete={onEventDelete}
                      onInfoOpen={handleEventClick}
                    />
                  ))}
              </div>
            ))}
          </div>
  
          {/* Modal for creating new events */}
          <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
            <div className={ss['modal-header']}>
              <h2 className={ss['modal-title']}>New Event</h2>
            </div>
            <EventForm 
              newEvent={newEvent}
              setNewEvent={setNewEvent}
              onSave={handleSaveEvent}
              onCancel={() => setIsModalOpen(false)}
            />
          </Modal>
  
          {/* Modal for displaying event info - pass onDelete handler */}
          <Modal isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)}>
            {selectedEvent && (
              <EventInfoDisplay 
                event={selectedEvent}
                onClose={() => setIsInfoOpen(false)}
                onDelete={onEventDelete}
              />
            )}
          </Modal>
        </div>
      </div>
    );
  };

export default CalendarGrid;