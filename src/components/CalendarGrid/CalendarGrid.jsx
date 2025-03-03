// CalendarGrid.js
import React from 'react';
import { parse, format, addMinutes } from 'date-fns';
import ss from './CalendarGrid.module.css';
import { Trash2, X } from 'lucide-react';


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

// New component for displaying event details
const EventInfoDisplay = ({ event, onClose }) => {
  return (
    <>
      <div className={ss['modal-header']}>
        <h2 className={ss['modal-title']}>{event.title}</h2>
      </div>
      <div className={ss['form-grid']}>
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
    const days = ['M', 'Tu', 'W', 'Th', 'F'];
    
    const handleDayToggle = (dayIndex) => {
      setNewEvent(prev => ({
        ...prev,
        selectedDays: prev.selectedDays.includes(dayIndex)
          ? prev.selectedDays.filter(d => d !== dayIndex)
          : [...prev.selectedDays, dayIndex]
      }));
    };
  
    return (
      <>
        <div className={ss['form-grid']}>
          <div className={ss['form-row']}>
            <label className={ss['form-label']}>Title</label>
            <input
              type="text"
              className={ss['form-input']}
              value={newEvent.title}
              onChange={(e) => setNewEvent({...newEvent, title: e.target.value})}
            />
          </div>
          <div className={ss['form-row']}>
            <label className={ss['form-label']}>Days</label>
            <div className={ss['days-grid']}>
              {days.map((day, index) => (
                <DayCheckbox
                  key={day}
                  day={day}
                  index={index}
                  checked={newEvent.selectedDays.includes(index)}
                  onChange={handleDayToggle}
                />
              ))}
            </div>
          </div>
          <div className={ss['form-row']}>
            <label className={ss['form-label']}>Time</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="time"
                className={ss['form-input']}
                value={newEvent.startTime}
                onChange={(e) => setNewEvent({...newEvent, startTime: e.target.value})}
                style={{ width: '50%' }}
              />
              <input
                type="time"
                className={ss['form-input']}
                value={newEvent.endTime}
                onChange={(e) => setNewEvent({...newEvent, endTime: e.target.value})}
                style={{ width: '50%' }}
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
    }
      
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
    selectedDays: [],
    professor: '',
    description: ''
};

const CalendarGrid = ({ events, startHour = 8, endHour = 20, onEventCreate, onEventDelete }) => {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const totalMinutes = (endHour - startHour) * 60;
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isInfoOpen, setIsInfoOpen] = React.useState(false);
  const [selectedEvent, setSelectedEvent] = React.useState(null);
  const [newEvent, setNewEvent] = React.useState({...defaultEventState});

  const parseTime = (timeStr) => parse(timeStr, 'HH:mm', new Date());

  const getMinutesSinceStart = (timeStr) => {
    const time = parseTime(timeStr);
    return time.getHours() * 60 + time.getMinutes() - startHour * 60;
  };

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
      selectedDays: [dayIndex], // Initialize with clicked day
    });
    setIsModalOpen(true);
  };

  const handleEventClick = (event) => {
    setSelectedEvent(event);
    setIsInfoOpen(true);
  };

  const handleSaveEvent = () => {
    if (newEvent.title && newEvent.startTime && newEvent.endTime && newEvent.selectedDays.length > 0) {
      // Create an event for each selected day
      newEvent.selectedDays.forEach(dayIndex => {
        const eventForDay = {
          ...newEvent,
          day: dayIndex
        };
        onEventCreate(eventForDay);
      });
      
      setIsModalOpen(false);
      setNewEvent({...defaultEventState});
    }
  };

  const calculateEventStyle = (startTime, endTime, eventIndex) => {
    const startMinutes = getMinutesSinceStart(startTime);
    const endMinutes = getMinutesSinceStart(endTime);
    const duration = endMinutes - startMinutes;
    const top = (startMinutes / totalMinutes) * 100;
    const height = (duration / totalMinutes) * 100;
    return { top: `${top}%`, height: `${height}%`, zIndex: eventIndex + 1 };
  };


  return (
    <div className={ss['calendar-container']}>
    <div className={ss['calendar-grid']}>
      <div className={ss['header-spacer']} />
      {days.map(day => (
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

        {days.map((_, dayIndex) => (
          <div 
            key={dayIndex} 
            className={ss['day-column']}
            onClick={(e) => handleTimeSlotClick(e, dayIndex)}
          >
            {Array.from({ length: (endHour - startHour) * 2 }).map((_, i) => (
              <div key={i} className={ss['grid-line']} />
            ))}
            
            {events
                .filter(event => event.day === dayIndex)
                .map((event, eventIndex) => (
                    <Event 
                    key={event.id}
                    event={event}
                    eventStyle={{
                        ...calculateEventStyle(event.startTime, event.endTime, eventIndex),
                        width: event.width,
                        left: event.left,
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

        {/* Modal for displaying event info */}
        <Modal isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)}>
            {selectedEvent && (
                <EventInfoDisplay 
                    event={selectedEvent}
                    onClose={() => setIsInfoOpen(false)}
                />
            )}
        </Modal>
      </div>
    </div>
  );
};

export default CalendarGrid;