// CalendarGrid.js
import React from 'react';
import { parse, format, addMinutes } from 'date-fns';
import { invoke } from "@tauri-apps/api/tauri";
import ss from './CalendarGrid.module.css';
import { Trash2 } from 'lucide-react';

const Modal = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;
  return (
    <div className={ss['modal-overlay']} onClick={onClose}>
      <div className={ss['modal-content']} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
};

const Event = ({ event, eventStyle, onDelete }) => {
    const asyncConfirm = async (message) => {
        return new Promise((resolve) => {
          const result = window.confirm(message);
          resolve(result); // Resolve the promise with the user's choice
        });
      };
      
      const handleDelete = async (e) => {
        e.stopPropagation(); // Prevent parent click handlers
      
        const confirmed = await asyncConfirm('Are you sure you want to delete this event?'); // Await user's choice
        if (!confirmed) return; // Exit early if the user cancels
      
        try {
          await invoke('delete_event_frontend', { eventId: event.id }); // Invoke deletion
          onDelete(event.id); // Notify parent about deletion
        } catch (err) {
          console.error('Error deleting event:', err); // Log error
          alert('Failed to delete event. Please try again.'); // Inform user
        }
      };
  
    return (
      <div
        className={`${ss.event} ${event.professor === '' ? ss.activity : ss.class}`}
        style={eventStyle}
        onClick={(e) => e.stopPropagation()}
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

const CalendarGrid = ({ events, startHour = 8, endHour = 20, onEventCreate, onEventDelete }) => {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const totalMinutes = (endHour - startHour) * 60;
  const containerRef = React.useRef(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [newEvent, setNewEvent] = React.useState({
    title: '',
    startTime: '',
    endTime: '',
    day: 0,
    professor: '',
    description: ''
  });

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
      title: '',
      startTime: clickTime,
      endTime: endTime,
      day: dayIndex,
      professor: '',
      description: ''
    });
    setIsModalOpen(true);
  };

  const handleSaveEvent = () => {
    if (newEvent.title && newEvent.startTime && newEvent.endTime) {
      onEventCreate(newEvent);
      setIsModalOpen(false);
      setNewEvent({
        title: '',
        startTime: '',
        endTime: '',
        day: 0,
        professor: '',
        description: ''
      });
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
                    />
                ))}
          </div>
        ))}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <div className={ss['modal-header']}>
          <h2 className={ss['modal-title']}>Create New Event</h2>
        </div>
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
            <label className={ss['form-label']}>Start Time</label>
            <input
              type="time"
              className={ss['form-input']}
              value={newEvent.startTime}
              onChange={(e) => setNewEvent({...newEvent, startTime: e.target.value})}
            />
          </div>
          <div className={ss['form-row']}>
            <label className={ss['form-label']}>End Time</label>
            <input
              type="time"
              className={ss['form-input']}
              value={newEvent.endTime}
              onChange={(e) => setNewEvent({...newEvent, endTime: e.target.value})}
            />
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
            <input
              type="text"
              className={ss['form-input']}
              value={newEvent.description}
              onChange={(e) => setNewEvent({...newEvent, description: e.target.value})}
            />
          </div>
        </div>
        <div className={ss['button-container']}>
          <button 
            className={`${ss.button} ${ss['button-outline']}`}
            onClick={() => setIsModalOpen(false)}
          >
            Cancel
          </button>
          <button 
            className={`${ss.button} ${ss['button-primary']}`}
            onClick={handleSaveEvent}
          >
            Create Event
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default CalendarGrid;