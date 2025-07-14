import { create } from 'zustand';
import { systemAPI, eventsAPI, schedulesAPI, favoritesAPI, classParametersAPI } from './api';

/**
 * Helper function to stringify schedules for use as unique keys
 * Ensures consistent serialization by sorting object keys
 * @param {Object} schedule - The schedule object to stringify
 * @returns {string|null} - JSON string representation or null if error
 */
const stringifySchedule = (schedule) => {
    try {
        return JSON.stringify(schedule, (key, value) => {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                return Object.keys(value)
                    .sort()
                    .reduce((sorted, key) => {
                        sorted[key] = value[key];
                        return sorted;
                    }, {});
            }
            return value;
        });
    } catch (e) {
        console.error("Failed to stringify schedule:", schedule, e);
        return null;
    }
};

/**
 * Helper function to add a new event to the processed events state object
 * Categorizes events by day and whether they have specific times
 * @param {Object} currentState - Current events state object
 * @param {Object} newEvent - Event object to add
 * @returns {Object} - New state object with event added
 */
const addEventToState = (currentState, newEvent) => {
    const newState = JSON.parse(JSON.stringify(currentState)); // Deep copy
    const day = newEvent.day.toString();
    
    // Check if it's a "no time" event
    if (newEvent.startTime === 0 && newEvent.endTime === 0) {
        if (!newState.noTimeEventsByDay[day]) {
            newState.noTimeEventsByDay[day] = [];
        }
        newState.noTimeEventsByDay[day].push(newEvent);
    } else {
        if (!newState.eventsByDay[day]) {
            newState.eventsByDay[day] = [];
        }
        newState.eventsByDay[day].push(newEvent);
    }
    return newState;
};

/**
 * Helper function to remove an event from the processed events state object
 * Searches through all days and event categories to find and remove the event
 * @param {Object} currentState - Current events state object
 * @param {string|number} eventId - ID of event to remove
 * @returns {Object} - New state object with event removed
 */
const removeEventFromState = (currentState, eventId) => {
    const newState = JSON.parse(JSON.stringify(currentState)); // Deep copy

    for (const day in newState.eventsByDay) {
        newState.eventsByDay[day] = newState.eventsByDay[day].filter(e => e.id !== eventId);
    }
    for (const day in newState.noTimeEventsByDay) {
        newState.noTimeEventsByDay[day] = newState.noTimeEventsByDay[day].filter(e => e.id !== eventId);
    }
    return newState;
};

/**
 * Main Zustand store for the scheduling application
 * Manages all application state including events, schedules, UI state, and class parameters
 */
const useStore = create((set, get) => ({
    // --- State ---
    
    /** @type {boolean} - Whether the sidebar is expanded */
    isExpanded: false,
    
    /** @type {Object} - User events organized by day and time category */
    userEvents: { eventsByDay: {}, noTimeEventsByDay: {} },
    
    /** @type {Array} - Array of generated schedules */
    schedules: [[]],
    
    /** @type {Array} - Array of user-favorited schedules */
    favoritedSchedules: [],
    
    /** @type {string|null} - ID of currently selected/pinned schedule */
    selectedScheduleId: null,
    
    /** @type {Object|null} - Currently hovered schedule for preview */
    currentHoveredSchedule: null,
    
    /** @type {Object|null} - Event object for details modal */
    detailsEvent: null,
    
    /** @type {boolean} - Loading state for scheduler operations */
    schedulerLoading: true,
    
    /** @type {string|null} - Error message for scheduler operations */
    schedulerError: null,
    
    /** @type {Object} - State for schedule generation process */
    scrapeState: { isScraping: false, status: "" },
    
    /** @type {Object} - Parameter checkboxes for schedule generation */
    paramCheckboxes: { box1: false, box2: false },
    
    /** @type {Array} - Array of class parameter objects */
    classes: [],
    
    /** @type {string} - Currently active tab in the UI */
    activeTab: 'schedules',
    
    /** @type {boolean} - Whether to render favorites view */
    renderFavorites: false,
    
    /** @type {Map} - Maps schedule strings to display numbers */
    scheduleDisplayNumbers: new Map(),
    
    /** @type {number} - Next available schedule display number */
    nextScheduleNumber: 1,

    // --- Actions ---

    // Sidebar
    /**
     * Sets the sidebar expansion state
     * @param {boolean} value - Whether sidebar should be expanded
     * @returns {void}
     */
    setIsExpanded: (value) => set({ isExpanded: value }),

    // Schedule Display Number Helpers
    /**
     * Assigns display numbers to schedules for UI identification
     * @param {Array} schedules - Array of schedule objects
     * @returns {void}
     * @private
     */
    _assignScheduleDisplayNumbers: (schedules) => {
        const state = get();
        const currentMapping = new Map(state.scheduleDisplayNumbers);
        let nextNumber = state.nextScheduleNumber;

        schedules.forEach(schedule => {
            const scheduleString = stringifySchedule(schedule);
            if (scheduleString && !currentMapping.has(scheduleString)) {
                currentMapping.set(scheduleString, nextNumber);
                nextNumber++;
            }
        });

        set({
            scheduleDisplayNumbers: currentMapping,
            nextScheduleNumber: nextNumber
        });
    },

    /**
     * Gets the display number for a schedule
     * @param {string} scheduleString - Stringified schedule
     * @returns {number|string} - Display number or "?" if not found
     */
    getScheduleDisplayNumber: (scheduleString) => {
        const state = get();
        return state.scheduleDisplayNumbers.get(scheduleString) || "?";
    },

    /**
     * Clears scraping status and errors
     * @returns {void}
     */
    clearScrapeStatus: () => set({ scrapeState: { isScraping: false, status: "" }, schedulerError: null }),

    // Core Data Loading
    /**
     * Updates scheduler data from backend APIs
     * Fetches events, schedules, and favorites concurrently
     * @returns {Promise<void>}
     * @throws {Error} When API calls fail
     * @private
     */
    _updateSchedulerData: async () => {
        try {
            const [loadedEventsResult, loadedSchedules, loadedFavorites] = await Promise.all([
                eventsAPI.getAll(),
                schedulesAPI.getAll(),
                favoritesAPI.getAll()
            ]);

            const finalSchedules = (Array.isArray(loadedSchedules) && loadedSchedules.length > 0) ? loadedSchedules : [[]];
            get()._assignScheduleDisplayNumbers(finalSchedules);

            set({
                userEvents: loadedEventsResult || { eventsByDay: {}, noTimeEventsByDay: {} },
                schedules: finalSchedules,
                favoritedSchedules: (Array.isArray(loadedFavorites) && loadedFavorites.length > 0) ? loadedFavorites : [],
                schedulerError: null,
            });
        } catch (err) {
            console.error('Error refreshing scheduler data:', err);
            set({ schedulerError: 'Failed to refresh some schedule data.' });
        }
    },

    /**
     * Loads all data needed for the scheduler page
     * Called on initial page load
     * @returns {Promise<void>}
     * @async
     * @throws {Error} When initial data loading fails
     */
    loadSchedulerPage: async () => {
        set({ schedulerLoading: true, schedulerError: null });
        try {
            await get()._updateSchedulerData();

            const [loadedSelectedScheduleIndex, loadedClasses] = await Promise.all([
                systemAPI.getDisplaySchedule(),
                classParametersAPI.getAll()
            ]);
            
            const { schedules } = get();
            const selectedId = (loadedSelectedScheduleIndex !== null && schedules[loadedSelectedScheduleIndex])
                ? stringifySchedule(schedules[loadedSelectedScheduleIndex])
                : null;

            set({
                selectedScheduleId: selectedId,
                classes: loadedClasses || [],
                schedulerLoading: false,
            });
        } catch (err) {
            console.error('Error loading scheduler page data:', err);
            set({
                schedulerError: 'Failed to load schedule data. Please try again later.',
                userEvents: { eventsByDay: {}, noTimeEventsByDay: {} },
                schedules: [[]],
                favoritedSchedules: [],
                classes: [],
                schedulerLoading: false,
            });
        }
    },

    // Event CRUD Actions
    /**
     * Creates a new user event
     * @param {Object} newEventData - Event data object
     * @param {string} newEventData.title - Event title (required)
     * @param {number} newEventData.day - Day bitmask
     * @param {number} newEventData.startTime - Start time in minutes
     * @param {number} newEventData.endTime - End time in minutes
     * @returns {Promise<void>}
     * @async
     * @throws {Error} When event creation fails
     */
    createUserEvent: async (newEventData) => {
        set({ schedulerError: null });
        // Minimal validation, backend handles the rest
        if (!newEventData || !newEventData.title) {
            set({ schedulerError: 'Failed to save event: Title is required.' });
            return;
        }

        try {
            // Backend now returns the full event with its new ID
            const createdEvent = await eventsAPI.create(newEventData);
            
            // Optimistically add the returned event to the state
            set(state => ({
                userEvents: addEventToState(state.userEvents, createdEvent)
            }));
        } catch (err) {
            console.error('Error saving event:', err);
            set({ schedulerError: 'Failed to save event. Please try again.' });
            await get()._updateSchedulerData(); // Re-sync on error
        }
    },

    /**
     * Updates an existing user event
     * @param {Object} updatedEventData - Updated event data
     * @param {string|number} updatedEventData.id - Event ID (required)
     * @returns {Promise<void>}
     * @async
     * @throws {Error} When event update fails
     */
    updateUserEvent: async (updatedEventData) => {
        set({ schedulerError: null });
        if (!updatedEventData || !updatedEventData.id) {
            set({ schedulerError: 'Failed to update event: Invalid event data or missing ID.' });
            return;
        }
        
        // Due to complexity of moving events between days/times in the UI state,
        // we'll do a simple backend call and refresh. This is reliable and avoids UI bugs.
        try {
            await eventsAPI.update(updatedEventData);
            await get()._updateSchedulerData(); // Refresh from source of truth
        } catch (err) {
            console.error('Error updating event:', err);
            set({ schedulerError: 'Failed to update event. Please try again.' });
            await get()._updateSchedulerData(); // Re-sync on error
        }
    },

    /**
     * Deletes a user event
     * @param {string|number} eventId - ID of event to delete
     * @returns {Promise<void>}
     * @async
     * @throws {Error} If eventId is invalid or deletion fails
     */
    deleteUserEvent: async (eventId) => {
        set({ schedulerError: null });
        if (!eventId) {
            throw new Error('Invalid event ID');
        }

        const originalUserEvents = get().userEvents;
        // Optimistically remove from UI
        set(state => ({
            userEvents: removeEventFromState(state.userEvents, eventId)
        }));

        try {
            await eventsAPI.delete(eventId);
        } catch (err) {
            console.error('Error deleting event:', err);
            // Revert on failure
            set({ schedulerError: 'Failed to delete event. Please try again.', userEvents: originalUserEvents });
            throw err; // Re-throw so UI can know it failed
        }
    },

    // Schedule Generation & Management
    /**
     * Generates new schedules based on current parameters and events
     * Uses class parameters, user events, and checkbox settings to create optimized schedules
     * @returns {Promise<void>}
     * @async
     * @throws {Error} When schedule generation fails
     * @example
     * // Generate schedules with current state
     * await generateSchedules();
     * 
     * @description This function:
     * 1. Extracts user events from the organized state structure
     * 2. Formats events for backend consumption
     * 3. Calls the schedules API with parameters, classes, and events
     * 4. Updates the UI state with generated schedules
     * 5. Clears any previously pinned schedule
     */
    generateSchedules: async () => {
        set({ scrapeState: { isScraping: true, status: "Preparing data..." }, schedulerError: null });
        const { paramCheckboxes, classes, userEvents } = get();
        try {
            // Extract raw events from the processed structure
            const rawUserEvents = [];
            const seenIds = new Set();
            [...Object.values(userEvents.eventsByDay), ...Object.values(userEvents.noTimeEventsByDay)]
                .flat()
                .forEach(event => {
                    if (!seenIds.has(event.id)) {
                        rawUserEvents.push(event);
                        seenIds.add(event.id);
                    }
                });

            // Format events for backend consumption
            const formattedUserEventsForScrape = rawUserEvents.map(event => ({
                time: [event.startTime, event.endTime],
                days: event.day // Send the raw bitmask
            }));

            const result = await schedulesAPI.generate({
                params_checkbox: [paramCheckboxes.box1, paramCheckboxes.box2, false],
                classes: classes,
                events: formattedUserEventsForScrape
            });

            if (typeof result === 'string') {
                set({ scrapeState: { isScraping: false, status: `Error: ${result}` }});
            } else {
                set({
                    scrapeState: { isScraping: false, status: "Schedules generated successfully!" },
                    schedules: result || [[]],
                    selectedScheduleId: null, // Clear pinned schedule after generating new ones
                });
                await systemAPI.setDisplaySchedule(null); // Un-pin from backend
                get()._assignScheduleDisplayNumbers(result || [[]]);
            }
        } catch (error) {
            console.error("Error during schedule generation:", error);
            set({ scrapeState: { isScraping: false, status: `Error: ${error.message}` }});
        }
    },
    
    /**
     * Sets or toggles the selected/pinned schedule
     * @param {Object} scheduleData - Schedule object to select
     * @returns {Promise<void>}
     * @async
     * @throws {Error} When schedule selection fails
     */
    setSelectedSchedule: async (scheduleData) => {
        set({ schedulerError: null });
        const scheduleId = stringifySchedule(scheduleData);
        const { selectedScheduleId, schedules } = get();
        
        const newSelectedId = selectedScheduleId === scheduleId ? null : scheduleId;
        
        try {
            // Find the index for the backend, which still expects it
            const newSelectedIndex = newSelectedId 
                ? schedules.findIndex(s => stringifySchedule(s) === newSelectedId) 
                : null;
            
            await systemAPI.setDisplaySchedule(newSelectedIndex === -1 ? null : newSelectedIndex);
            set({ selectedScheduleId: newSelectedId, currentHoveredSchedule: null });
        } catch (error) {
            console.error("Failed to set display schedule:", error);
            set({ schedulerError: "Failed to pin schedule." });
        }
    },

    /**
     * Deletes a schedule from either regular schedules or favorites
     * @param {string} scheduleIdString - Stringified schedule ID
     * @param {boolean} isCurrentlyFavorite - Whether schedule is currently favorited
     * @returns {Promise<void>}
     * @async
     * @throws {Error} When schedule deletion fails
     */
    deleteSchedule: async (scheduleIdString, isCurrentlyFavorite) => {
        set({ currentHoveredSchedule: null, schedulerError: null });
        try {
            await schedulesAPI.delete(scheduleIdString, isCurrentlyFavorite);

            // If the deleted schedule was the selected one, un-select it.
            if (get().selectedScheduleId === scheduleIdString) {
                set({ selectedScheduleId: null });
                await systemAPI.setDisplaySchedule(null);
            }
            
            set(state => {
                const newMapping = new Map(state.scheduleDisplayNumbers);
                newMapping.delete(scheduleIdString);
                return { scheduleDisplayNumbers: newMapping };
            });

            await get()._updateSchedulerData();
        } catch (error) {
            console.error("Failed to delete schedule:", error);
            set({ schedulerError: `Failed to delete schedule.` });
            await get()._updateSchedulerData(); // Re-sync on error
        }
    },

    /**
     * Toggles the favorite status of a schedule
     * @param {Object} scheduleData - Schedule object
     * @param {string} scheduleString - Stringified schedule
     * @param {boolean} isCurrentlyFavorite - Current favorite status
     * @returns {Promise<void>}
     * @async
     * @throws {Error} When favorite toggle fails
     */
    toggleFavoriteSchedule: async (scheduleData, scheduleString, isCurrentlyFavorite) => {
        set({ schedulerError: null });
        try {
            await favoritesAPI.changeFavorite(scheduleString, isCurrentlyFavorite, scheduleData);
            await get()._updateSchedulerData();
        } catch (error) {
            console.error("Failed to update favorite status:", error);
            set({ schedulerError: `Failed to update favorite status.` });
            await get()._updateSchedulerData();
        }
    },

    // Other UI State Actions
    /**
     * Sets the currently hovered schedule for preview
     * @param {Object} scheduleData - Schedule object to hover
     * @returns {void}
     */
    setHoveredSchedule: (scheduleData) => set({ currentHoveredSchedule: scheduleData }),

    /**
     * Clears the currently hovered schedule
     * @returns {void}
     */
    clearHoveredSchedule: () => set({ currentHoveredSchedule: null }),

    /**
     * Shows the event details modal
     * @param {Object} event - Event object to show details for
     * @returns {void}
     */
    showEventDetailsModal: (event) => set({ detailsEvent: event }),

    /**
     * Closes the event details modal
     * @returns {void}
     */
    closeEventDetailsModal: () => set({ detailsEvent: null }),

    /**
     * Toggles between regular schedules and favorites view
     * @returns {void}
     */
    toggleRenderFavorites: () => set(state => ({ renderFavorites: !state.renderFavorites, currentHoveredSchedule: null })),

    /**
     * Sets the active tab in the UI
     * @param {string} tabName - Name of tab to activate
     * @returns {void}
     */
    setActiveTab: (tabName) => set({ activeTab: tabName }),

    /**
     * Toggles a parameter checkbox for schedule generation
     * @param {string} boxName - Name of checkbox to toggle (box1, box2)
     * @returns {void}
     */
    toggleParamCheckbox: (boxName) => {
        set(state => ({
            paramCheckboxes: { ...state.paramCheckboxes, [boxName]: !state.paramCheckboxes[boxName] }
        }));
    },

    // Class Parameter Actions
    /**
     * Adds a new empty class to the parameters list
     * @returns {void}
     */
    addClass: () => {
        const newClass = {
            id: `${Date.now().toString()}-${Math.random().toString(36).substring(2,9)}`,
            code: '', name: '', section: '', instructor: '',
        };
        set(state => ({ classes: [...state.classes, newClass] }));
    },

    /**
     * Updates an existing class parameter
     * @param {Object} classData - Updated class data
     * @param {string} classData.id - Class ID (required)
     * @returns {Promise<void>}
     * @async
     * @throws {Error} When class update fails
     */
    updateClass: async (classData) => {
        const originalClasses = [...get().classes];
        set(state => ({
            classes: state.classes.map(item => item.id === classData.id ? { ...classData } : item)
        }));
        try {
            await classParametersAPI.update(classData);
        } catch (err) {
            console.error("Error updating class:", err);
            set({ schedulerError: 'Failed to update class.', classes: originalClasses });
        }
    },

    /**
     * Deletes a class parameter
     * @param {string} classId - ID of class to delete
     * @returns {Promise<void>}
     * @async
     * @throws {Error} When class deletion fails
     */
    deleteClass: async (classId) => {
        const originalClasses = get().classes;
        set(state => ({ classes: state.classes.filter(item => item.id !== classId) }));
        try {
            await classParametersAPI.remove(classId);
        } catch (err) {
            console.error("Error deleting class:", err);
            set({ schedulerError: 'Failed to delete class.', classes: originalClasses });
        }
    },
}));

export { stringifySchedule };
export default useStore;