// src/components/CalendarGrid/CalendarModals.jsx
import PropTypes from 'prop-types';
import { X } from 'lucide-react';

/**
 * @fileoverview Calendar modal components for event creation, editing, and viewing
 * Contains reusable modal components that work with the CalendarGrid system
 * Styles are passed as props to maintain flexibility and avoid CSS module dependencies
 */

// === DAY MANAGEMENT CONSTANTS AND UTILITIES ===

/** @constant {Array<string>} Short day labels for form checkboxes (Mon-Fri) */
const dayShortLabels = ['M', 'Tu', 'W', 'Th', 'F'];

/**
 * Converts day index to corresponding bit position in bitmask
 * Uses 1-based bit positioning to match backend expectations
 * @param {number} index - Day index (0 for Monday, 1 for Tuesday, etc.)
 * @returns {number} Bit value for the day (2 for Monday, 4 for Tuesday, etc.)
 * 
 * @example
 * dayIndexToBit(0) // Returns 2 (Monday bit)
 * dayIndexToBit(1) // Returns 4 (Tuesday bit)
 * dayIndexToBit(4) // Returns 32 (Friday bit)
 */
const dayIndexToBit = (index) => 1 << (index + 1);

/**
 * Checks if a specific day is selected in the bitmask
 * @param {number} dayBits - Day bitmask containing selected days
 * @param {number} dayIndex - Day index to check (0-4 for Mon-Fri)
 * @returns {boolean} True if the day is selected in the bitmask
 * 
 * @example
 * isDaySelected(6, 0) // Returns true (Monday is selected in bitmask 6)
 * isDaySelected(6, 1) // Returns true (Tuesday is selected in bitmask 6)
 * isDaySelected(6, 2) // Returns false (Wednesday is not selected in bitmask 6)
 */
const isDaySelected = (dayBits, dayIndex) => (dayBits & (1 << (dayIndex + 1))) !== 0;

// === FORM COMPONENTS ===

/**
 * Individual day checkbox component for event form
 * Displays a styled checkbox with day label for day selection
 * 
 * @component
 * @param {Object} props - Component props
 * @param {string} props.day - Short day label to display (e.g., "M", "Tu")
 * @param {number} props.index - Day index for bit calculation (0-4)
 * @param {boolean} props.checked - Whether this day is currently selected
 * @param {Function} props.onChange - Callback when checkbox state changes
 * @param {number} props.onChange.index - Day index passed to callback
 * @param {Object} props.styles - CSS module styles object
 * @returns {JSX.Element} Styled checkbox with day label
 */
const DayCheckbox = ({ day, index, checked, onChange, styles }) => (
  <label className={`${styles['day-checkbox']} ${checked ? styles.selected : ''}`}>
    <input type="checkbox" checked={checked} onChange={() => onChange(index)} />
    <span className={styles['days-text']}>{day}</span>
  </label>
);

// PropTypes for DayCheckbox
DayCheckbox.propTypes = {
  day: PropTypes.string.isRequired,
  index: PropTypes.number.isRequired,
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  styles: PropTypes.object.isRequired
};

// === MODAL COMPONENTS ===

/**
 * Base modal wrapper component with backdrop and close functionality
 * Provides consistent modal behavior and styling across different modal types
 * 
 * @component
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether the modal is currently visible
 * @param {Function} props.onClose - Callback to close the modal
 * @param {React.ReactNode} props.children - Modal content to render
 * @param {Object} props.styles - CSS module styles object
 * @returns {JSX.Element} Modal wrapper with backdrop and close button
 * 
 * @example
 * <Modal isOpen={showModal} onClose={handleClose} styles={ss}>
 *   <div>Modal content here</div>
 * </Modal>
 */
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

// PropTypes for Modal
Modal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
  styles: PropTypes.object.isRequired
};

/**
 * Modal for displaying read-only event details
 * Used primarily for preview events from generated schedules
 * 
 * @component
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether the modal is currently visible
 * @param {Function} props.onClose - Callback to close the modal
 * @param {Object|null} props.event - Event object to display details for
 * @param {string} props.event.title - Event title
 * @param {string} [props.event.description] - Event description (optional)
 * @param {string|number} props.event.startTime - Start time (formatted or integer)
 * @param {string|number} props.event.endTime - End time (formatted or integer)
 * @param {Object} props.styles - CSS module styles object
 * @returns {JSX.Element|null} Details modal or null if no event provided
 */
export const DetailsModal = ({ isOpen, onClose, event, styles }) => {
  if (!event) return null;

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

// PropTypes for DetailsModal
DetailsModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  event: PropTypes.shape({
    title: PropTypes.string.isRequired,
    description: PropTypes.string,
    startTime: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    endTime: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  }),
  styles: PropTypes.object.isRequired
};

/**
 * Form modal for creating and editing user events
 * Provides comprehensive event editing with validation and day selection
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.event - Event data object for form fields
 * @param {string|null} props.event.id - Event ID (null for new events)
 * @param {string} props.event.title - Event title
 * @param {string} props.event.startTime - Start time in HH:MM format
 * @param {string} props.event.endTime - End time in HH:MM format
 * @param {number} props.event.day - Day bitmask for selected days
 * @param {string} props.event.professor - Professor/instructor name
 * @param {string} props.event.description - Event description
 * @param {Function} props.setEvent - Function to update event data
 * @param {Function} props.onSave - Callback to save the event
 * @param {Function} props.onCancel - Callback to cancel editing
 * @param {Function} [props.onDelete] - Callback to delete the event (editing mode only)
 * @param {boolean} [props.isEditing=false] - Whether in edit mode vs create mode
 * @param {Object} props.styles - CSS module styles object
 * @returns {JSX.Element} Event form with all input fields and action buttons
 */
export const EventForm = ({ event, setEvent, onSave, onCancel, onDelete, isEditing = false, styles }) => {
  /**
   * Handles toggling of day selection in the form
   * Uses XOR operation to toggle the specific day bit
   * @param {number} dayIndex - Index of day to toggle (0-4 for Mon-Fri)
   */
  const handleDayToggle = (dayIndex) => {
    const dayBit = dayIndexToBit(dayIndex);
    setEvent(prev => ({ ...prev, day: prev.day ^ dayBit }));
  };

  /**
   * Handles event deletion with proper async flow
   * Calls the delete callback and lets the store handle confirmation and modal closure
   * Modal stays open until deletion is confirmed or cancelled
   */
  const handleDelete = () => {
    if (onDelete) {
      onDelete(event.id); // This calls Store's deleteUserEvent which shows confirmation
      // DO NOT call onCancel() here - let the Store handle modal closure after successful deletion
      // The modal should stay open until the user confirms or cancels the deletion
    }
  };

  return (
    <>
      {/* Modal Header */}
      <div className={styles['modal-header']}>
        <h2 className={styles['modal-title']}>{isEditing ? 'Edit Event' : 'New Event'}</h2>
      </div>
      
      {/* Form Fields */}
      <div className={styles['form-grid']}>
        {/* Title Field - Required */}
        <div className={styles['form-row']}>
          <label className={styles['form-label']}>Title*</label>
          <input
            type="text"
            className={styles['form-input']}
            value={event.title}
            onChange={(e) => setEvent(prev => ({ ...prev, title: e.target.value }))}
          />
        </div>
        
        {/* Day Selection - Required */}
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
        
        {/* Time Fields - Required */}
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
        
        {/* Professor Field - Optional */}
        <div className={styles['form-row']}>
          <label className={styles['form-label']}>Professor</label>
          <input
            type="text"
            className={styles['form-input']}
            value={event.professor}
            onChange={(e) => setEvent(prev => ({ ...prev, professor: e.target.value }))}
          />
        </div>
        
        {/* Description Field - Optional */}
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
      
      {/* Action Buttons */}
      <div className={`${styles['button-container']} ${styles['button-container-split']}`}>
        {/* Cancel Button */}
        <button className={`${styles.button} ${styles['button-outline']}`} onClick={onCancel}>Cancel</button>
        
        {/* Action Button Group */}
        <div className={styles['action-button-group']}>
          {/* Delete Button - Only shown in edit mode */}
          {isEditing && (
            <button className={`${styles.button} ${styles['button-danger']}`} onClick={handleDelete}>
              Delete
            </button>
          )}
          
          {/* Save/Create Button - Disabled if required fields are missing */}
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

// PropTypes for EventForm
EventForm.propTypes = {
  event: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    title: PropTypes.string.isRequired,
    startTime: PropTypes.string.isRequired,
    endTime: PropTypes.string.isRequired,
    day: PropTypes.number.isRequired,
    professor: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired
  }).isRequired,
  setEvent: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  onDelete: PropTypes.func,
  isEditing: PropTypes.bool,
  styles: PropTypes.object.isRequired
};
