// src/components/CalendarGrid/CalendarGrid.jsx
import React from 'react';
import { parse, format, addMinutes } from 'date-fns';
import ss from './CalendarGrid.module.css';
import { Trash2, X } from 'lucide-react';

// Day constants for bitwise operations
// const DAYS = { ... }; // Not directly used here, but good for context

// Display names for each day
const dayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI']; // For UI column headers
const dayShortLabels = ['M', 'Tu', 'W', 'Th', 'F']; // For EventForm and getDayLabelsFromBits

// Helper function to convert day index to bit flag
const dayIndexToBit = (index) => 1 << (index + 1); // UI index (0=Mon) maps to bit 1 (Monday)

// Helper function to check if a day bit is set in the day integer
const isDaySelected = (dayBits, dayIndex) => { // dayIndex is UI index (0=Mon)
  return (dayBits & (1 << (dayIndex + 1))) !== 0;
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
// ...
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

const EventForm = ({ event, setEvent, onSave, onCancel, onDelete, isEditing = false }) => {
  const handleDayToggle = (dayIndex) => {
    const dayBit = dayIndexToBit(dayIndex);
    setEvent(prev => ({
      ...prev,
      day: prev.day ^ dayBit 
    }));
  };

  const handleDelete = async () => {
// ...
    const confirmed = await new Promise((resolve) => {
      const result = window.confirm('Are you sure you want to delete this event?');
      resolve(result);
    });
    
    if (confirmed && onDelete) {
      onDelete(event.id);
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
            value={event.title}
            onChange={(e) => setEvent({...event, title: e.target.value})}
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
{/* ... rest of EventForm ... */}
        <div className={ss['form-row']}>
          <label className={ss['form-label']}>Time*</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="time"
              className={ss['form-input']}
              value={event.startTime}
              onChange={(e) => setEvent({...event, startTime: e.target.value})}
              style={{ width: '50%' }}
              onClick={(e) => e.stopPropagation()}
            />
            <input
              type="time"
              className={ss['form-input']}
              value={event.endTime}
              onChange={(e) => setEvent({...event, endTime: e.target.value})}
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
            onChange={(e) => setEvent({...event, professor: e.target.value})}
          />
        </div>
        <div className={ss['form-row']}>
          <label className={ss['form-label']}>Description</label>
          <textarea
            className={ss['form-textarea']}
            value={event.description}
            onChange={(e) => setEvent({...event, description: e.target.value})}
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
            onClick={onSave}
            disabled={!event.title || !event.startTime || !event.endTime || event.day === 0}
          >
            {isEditing ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </>
  );
};

const Event = ({ event, eventStyle, onDelete, onEdit }) => {
// ...
  const asyncConfirm = async (message) => {
    return new Promise((resolve) => {
      const result = window.confirm(message);
      resolve(result); 
    });
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (!event.isPreview) { 
        onEdit(event); 
    }
  };
  
  const handleDelete = async (e) => {
// ...
    e.stopPropagation(); 
    if (event.isPreview) return; 
  
    const confirmed = await asyncConfirm('Are you sure you want to delete this event?'); 
    if (!confirmed) return; 
  
    try {
      onDelete(event.id); 
    } catch (err) {
      console.error('Error deleting event:', err); 
      alert('Failed to delete event. Please try again.'); 
    }
  };
  
  // const eventDays = getDayLabelsFromBits(event.day); // This can still be used if needed for display within the Event

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
  day: 0, 
  professor: '',
  description: ''
};

const CalendarGrid = ({ 
    events, // Expects: { "1": [monday_events], "2": [tuesday_events], ... } (key is dayBitIndex.toString())
    startHour = 8, 
    endHour = 20, 
    onEventCreate, 
    onEventDelete, 
    onEventUpdate 
}) => {
    const totalMinutes = (endHour - startHour) * 60;
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [editingEvent, setEditingEvent] = React.useState(null);
    const [newEvent, setNewEvent] = React.useState({...defaultEventState});
  
    const parseTime = (timeStr) => parse(timeStr, 'HH:mm', new Date());
  
    const getTimeFromPosition = (yPos, columnHeight) => {
// ...
      const percentageDown = yPos / columnHeight;
      const minutesSinceStart = Math.floor(percentageDown * totalMinutes);
      const hours = Math.floor(minutesSinceStart / 60) + startHour;
      const minutes = Math.floor((minutesSinceStart % 60) / 15) * 15;
      return format(new Date().setHours(hours, minutes), 'HH:mm');
    };
  
    const handleTimeSlotClick = (e, dayUiIndex) => { // dayUiIndex is 0 for Mon, 1 for Tue ...
      const columnRect = e.currentTarget.getBoundingClientRect();
      const relativeY = e.clientY - columnRect.top;
      const clickTime = getTimeFromPosition(relativeY, columnRect.height);
      const endTime = format(addMinutes(parseTime(clickTime), 60), 'HH:mm');
  
      setEditingEvent(null);
      setNewEvent({
        ...defaultEventState,
        startTime: clickTime,
        endTime: endTime,
        day: dayIndexToBit(dayUiIndex), // dayIndexToBit converts UI index to the correct day bit
      });
      setIsModalOpen(true);
    };
  
    const handleEditEvent = (event) => { 
      setEditingEvent(event);
      setNewEvent({...event}); 
      setIsModalOpen(true);
    };
  
    const handleSaveEvent = () => {
// ...
      if (newEvent.title && newEvent.startTime && newEvent.endTime && newEvent.day !== 0) {
        if (editingEvent) {
          onEventUpdate(newEvent);
        } else {
          onEventCreate(newEvent);
        }
        setIsModalOpen(false);
        setNewEvent({...defaultEventState});
        setEditingEvent(null);
      }
    };
  
    const handleCloseModal = () => {
// ...
      setIsModalOpen(false);
      setEditingEvent(null);
      setNewEvent({...defaultEventState});
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
              {Array.from({ length: endHour - startHour + 1 }).map((_, i) => (
                <div key={i} className={ss['hour-label']}>
                  <span>{`${startHour + i}:00`}</span>
                </div>
              ))}
            </div>
  
            {dayLabels.map((_, dayUiIndex) => { // dayUiIndex is 0 for Mon, 1 for Tue...
              // Convert UI day index (0=Mon, 1=Tue...) to the dayBitIndex key used in `events` map
              // Monday (UI index 0) -> bit 1. Tuesday (UI index 1) -> bit 2.
              const dayKeyForMap = (dayUiIndex + 1).toString(); 
              const eventsForThisColumn = events[dayKeyForMap] || [];

              return (
                <div 
                  key={dayUiIndex} 
                  className={ss['day-column']}
                  onClick={(e) => handleTimeSlotClick(e, dayUiIndex)}
                >
                  {Array.from({ length: (endHour - startHour) * 2 }).map((_, i) => (
                    <div key={`line-${i}`} className={ss['grid-line']} />
                  ))}
                  
                  {eventsForThisColumn.map((event, eventIndexInColumn) => (
                    <Event 
                      key={event.id} // event.id should be unique within this day's processed list
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
                    />
                  ))}
                </div>
              );
            })}
          </div>
  
          <Modal isOpen={isModalOpen} onClose={handleCloseModal}>
            <EventForm 
              event={newEvent}
              setEvent={setNewEvent}
              onSave={handleSaveEvent}
              onCancel={handleCloseModal}
              onDelete={onEventDelete}
              isEditing={!!editingEvent}
            />
          </Modal>
        </div>
      </div>
    );
  };

export default CalendarGrid;