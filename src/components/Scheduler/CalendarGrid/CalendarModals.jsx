// src/components/CalendarGrid/CalendarModals.jsx
import React from 'react';
import { X, Trash2 } from 'lucide-react';

// ss (styles object) will be passed as a prop from CalendarGrid.jsx
// This avoids needing to manage a separate CSS module for modals immediately
// or duplicating style imports if modals were to be used elsewhere with different styles.

const dayShortLabels = ['M', 'Tu', 'W', 'Th', 'F']; // Used by EventForm
const dayIndexToBit = (index) => 1 << (index + 1); // Used by EventForm
const isDaySelected = (dayBits, dayIndex) => (dayBits & (1 << (dayIndex + 1))) !== 0; // Used by EventForm

// Helper to get day names for display, used by DetailsModal
const getDaysFromBitmask = (dayBitmask) => {
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  if (!dayBitmask) return 'No scheduled days';
  return dayNames.filter((_, i) => (dayBitmask & (1 << (i + 1))) !== 0).join(', ');
};

const DayCheckbox = ({ day, index, checked, onChange, styles }) => (
  <label className={`${styles['day-checkbox']} ${checked ? styles.selected : ''}`}>
    <input type="checkbox" checked={checked} onChange={() => onChange(index)} />
    <span className={styles['days-text']}>{day}</span>
  </label>
);

export const Modal = ({ isOpen, onClose, children, styles }) => (
  <div className={`${styles['slide-modal-container']} ${isOpen ? styles['modal-open'] : ''}`} onClick={onClose}>
    <div className={styles['slide-modal']} onClick={e => e.stopPropagation()}>
      <button className={styles['close-button']} onClick={onClose} aria-label="Close modal">
        <X size={20} />
      </button>
      {children}
    </div>
  </div>
);

export const DetailsModal = ({ isOpen, onClose, event, styles }) => {
  if (!event) return null;
  const displayTime = (event.startTime === '00:00' && event.endTime === '00:00') 
    ? 'N/A' : `${event.startTime} - ${event.endTime}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} styles={styles}>
      <div className={styles['modal-header']}>
        <h2 className={styles['modal-title']}>{event.title}</h2>
      </div>
      <div className={styles['form-grid']}>
        {event.description && (
          <div className={styles['form-row']}>
            <label className={styles['form-label']}>Description</label>
            <p style={{whiteSpace: 'pre-wrap', wordBreak: 'break-word'}}>{event.description}</p>
          </div>
        )}
      </div>
      <div className={`${styles['button-container']} ${styles['button-container-end']}`}>
        <button className={`${styles.button} ${styles['button-primary']}`} onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
};

export const EventForm = ({ event, setEvent, onSave, onCancel, onDelete, isEditing = false, styles }) => {
  const handleDayToggle = (dayIndex) => {
    const dayBit = dayIndexToBit(dayIndex);
    setEvent(prev => ({ ...prev, day: prev.day ^ dayBit }));
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(event.id); // This calls Store's deleteUserEvent which shows confirmation
      // DO NOT call onCancel() here - let the Store handle modal closure after successful deletion
      // The modal should stay open until the user confirms or cancels the deletion
    }
  };

  return (
    <>
      <div className={styles['modal-header']}>
        <h2 className={styles['modal-title']}>{isEditing ? 'Edit Event' : 'New Event'}</h2>
      </div>
      <div className={styles['form-grid']}>
        <div className={styles['form-row']}>
          <label className={styles['form-label']}>Title*</label>
          <input
            type="text"
            className={styles['form-input']}
            value={event.title}
            onChange={(e) => setEvent(prev => ({ ...prev, title: e.target.value }))}
          />
        </div>
        <div className={styles['form-row']}>
          <label className={styles['form-label']}>Days*</label>
          <div className={styles['days-grid']}>
            {dayShortLabels.map((day, index) => (
              <DayCheckbox
                key={day}
                day={day}
                index={index}
                checked={isDaySelected(event.day, index)}
                onChange={handleDayToggle}
                styles={styles}
              />
            ))}
          </div>
        </div>
        <div className={styles['form-row']}>
          <label className={styles['form-label']}>Time*</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="time"
              className={styles['form-input']}
              value={event.startTime} // Expects "HH:mm" string format
              onChange={(e) => setEvent(prev => ({ ...prev, startTime: e.target.value }))}
              style={{ width: '50%' }}
              onClick={(e) => e.stopPropagation()} // Prevent modal close on time input click
            />
            <input
              type="time"
              className={styles['form-input']}
              value={event.endTime} // Expects "HH:mm" string format
              onChange={(e) => setEvent(prev => ({ ...prev, endTime: e.target.value }))}
              style={{ width: '50%' }}
              onClick={(e) => e.stopPropagation()} // Prevent modal close on time input click
            />
          </div>
        </div>
        <div className={styles['form-row']}>
          <label className={styles['form-label']}>Professor</label>
          <input
            type="text"
            className={styles['form-input']}
            value={event.professor}
            onChange={(e) => setEvent(prev => ({ ...prev, professor: e.target.value }))}
          />
        </div>
        <div className={styles['form-row']}>
          <label className={styles['form-label']}>Description</label>
          <textarea
            className={styles['form-textarea']}
            value={event.description}
            onChange={(e) => setEvent(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Add event description..."
          />
        </div>
      </div>
      <div className={`${styles['button-container']} ${styles['button-container-split']}`}>
        <button className={`${styles.button} ${styles['button-outline']}`} onClick={onCancel}>Cancel</button>
        
        <div className={styles['action-button-group']}>
          {isEditing && (
            <button className={`${styles.button} ${styles['button-danger']}`} onClick={handleDelete}>
              Delete
            </button>
          )}
          <button 
            className={`${styles.button} ${styles['button-primary']}`}
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