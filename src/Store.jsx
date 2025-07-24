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
    
    isExpanded: false,
    userEvents: { eventsByDay: {}, noTimeEventsByDay: {} },
    // FIX: Initialize schedules as an empty array for more consistent logic.
    schedules: [], 
    favoritedSchedules: [],
    selectedScheduleId: null,
    currentHoveredSchedule: null,
    detailsEvent: null,
    schedulerLoading: true,
    schedulerError: null,
    scrapeState: { isScraping: false, status: "" },
    paramCheckboxes: { box1: false, box2: false },
    classes: [],
    activeTab: 'schedules',
    renderFavorites: false,
    scheduleDisplayNumbers: new Map(),
    nextScheduleNumber: 1,

    // --- Actions ---

    setIsExpanded: (value) => set({ isExpanded: value }),

    _loadPersistedScheduleNumbers: () => {
        try {
            const savedNumbers = localStorage.getItem('scheduleDisplayNumbers');
            const savedNextNumber = localStorage.getItem('nextScheduleNumber');
            
            if (savedNumbers && savedNextNumber) {
                const numbersMap = new Map(JSON.parse(savedNumbers));
                const nextNumber = parseInt(savedNextNumber, 10);
                
                set({
                    scheduleDisplayNumbers: numbersMap,
                    nextScheduleNumber: nextNumber
                });
            }
        } catch (error) {
            console.error('Error loading persisted schedule numbers:', error);
        }
    },

    _persistScheduleNumbers: () => {
        try {
            const { scheduleDisplayNumbers, nextScheduleNumber } = get();
            localStorage.setItem('scheduleDisplayNumbers', JSON.stringify([...scheduleDisplayNumbers]));
            localStorage.setItem('nextScheduleNumber', nextScheduleNumber.toString());
        } catch (error) {
            console.error('Error persisting schedule numbers:', error);
        }
    },

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

        // Persist the updated numbers
        get()._persistScheduleNumbers();
    },

    getScheduleDisplayNumber: (scheduleString) => {
        const state = get();
        return state.scheduleDisplayNumbers.get(scheduleString) || "?";
    },

    clearScrapeStatus: () => set({ scrapeState: { isScraping: false, status: "" }, schedulerError: null }),
    
    _updateEventsData: async () => {
        try {
            const loadedEventsResult = await eventsAPI.getAll();
            set({
                userEvents: loadedEventsResult || { eventsByDay: {}, noTimeEventsByDay: {} },
                schedulerError: null,
            });
        } catch (err) {
            console.error('Error refreshing event data:', err);
            set({ schedulerError: 'Failed to refresh event data.' });
        }
    },

    _updateSchedulerData: async () => {
        try {
            const [loadedEventsResult, loadedSchedules, loadedFavorites] = await Promise.all([
                eventsAPI.getAll(),
                schedulesAPI.getAll(),
                favoritesAPI.getAll()
            ]);

            const finalSchedules = Array.isArray(loadedSchedules) ? loadedSchedules : [];
            get()._assignScheduleDisplayNumbers(finalSchedules);

            set({
                userEvents: loadedEventsResult || { eventsByDay: {}, noTimeEventsByDay: {} },
                schedules: finalSchedules,
                favoritedSchedules: Array.isArray(loadedFavorites) ? loadedFavorites : [],
                schedulerError: null,
            });
        } catch (err) {
            console.error('Error refreshing scheduler data:', err);
            set({ schedulerError: 'Failed to refresh some schedule data.' });
        }
    },

    loadSchedulerPage: async () => {
        set({ schedulerLoading: true, schedulerError: null });
        
        // Load persisted schedule numbers before loading schedules
        get()._loadPersistedScheduleNumbers();
        
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
                schedules: [],
                favoritedSchedules: [],
                classes: [],
                schedulerLoading: false,
            });
        }
    },
    
    createUserEvent: async (newEventData) => {
        set({ schedulerError: null });
        if (!newEventData || !newEventData.title) {
            set({ schedulerError: 'Failed to save event: Title is required.' });
            return;
        }

        try {
            const eventPayload = {
                ...newEventData,
                start_time: newEventData.startTime,
                end_time: newEventData.endTime,
            };
            delete eventPayload.startTime;
            delete eventPayload.endTime;
            
            await eventsAPI.create(eventPayload);
            await get()._updateEventsData();
        } catch (err) {
            console.error('Error saving event:', err);
            set({ schedulerError: 'Failed to save event. Please try again.' });
        }
    },
    
    updateUserEvent: async (updatedEventData) => {
        set({ schedulerError: null });
        if (!updatedEventData || !updatedEventData.id) {
            set({ schedulerError: 'Failed to update event: Invalid event data or missing ID.' });
            return;
        }

        const originalUserEvents = get().userEvents;
        
        set(state => {
            const stateWithoutEvent = removeEventFromState(state.userEvents, updatedEventData.id);
            const newState = addEventToState(stateWithoutEvent, updatedEventData);
            return { userEvents: newState };
        });

        try {
            const eventPayload = {
                ...updatedEventData,
                start_time: updatedEventData.startTime,
                end_time: updatedEventData.endTime,
            };
            delete eventPayload.startTime;
            delete eventPayload.endTime;
            await eventsAPI.update(eventPayload);
        } catch (err) {
            console.error('Error updating event:', err);
            set({ 
                schedulerError: 'Failed to update event. Please try again.',
                userEvents: originalUserEvents 
            });
        }
    },

    deleteUserEvent: async (eventId) => {
        set({ schedulerError: null });
        if (!eventId) {
            throw new Error('Invalid event ID');
        }
        try {
            await eventsAPI.delete(eventId);
            await get()._updateEventsData();
        } catch (err) {
            console.error('Error deleting event:', err);
            set({ schedulerError: 'Failed to delete event. Please try again.'});
            throw err;
        }
    },

    generateSchedules: async () => {
        set({ scrapeState: { isScraping: true, status: "Preparing data..." }, schedulerError: null });
        const { paramCheckboxes, classes, userEvents } = get();
        try {
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

            const formattedUserEventsForScrape = rawUserEvents.map(event => {
                const timePair = [event.startTime ?? 0, event.endTime ?? 0];
                const daysArray = [];
                for (let dayBit = 1; dayBit <= 5; dayBit++) {
                    if ((event.day & (1 << dayBit)) !== 0) {
                        daysArray.push(true);
                    } else {
                        daysArray.push(false);
                    }
                }
                return { time: timePair, days: daysArray };
            });

            const payload = {
                classes: classes,
                events: formattedUserEventsForScrape,
                params_checkbox: [paramCheckboxes.box1, paramCheckboxes.box2, false],
            };
            
            const result = await schedulesAPI.generate(payload);

            if (typeof result === 'string') {
                set({ scrapeState: { isScraping: false, status: `Error: ${result}` }});
            } else {
                // FIX: Provide a more descriptive status message based on the result.
                const successMessage = result && result.length > 0 
                    ? `${result.length} schedule(s) generated successfully!` 
                    : "No matching schedules found. Try adjusting your courses or parameters.";

                set({
                    scrapeState: { isScraping: false, status: successMessage },
                    // Ensure schedules is set to the result, or an empty array if null.
                    schedules: result || [],
                    selectedScheduleId: null,
                });
                await systemAPI.setDisplaySchedule(null);
                // Assign display numbers to new schedules while preserving existing ones
                get()._assignScheduleDisplayNumbers(result || []);
            }
        } catch (error) {
            console.error("Error during schedule generation:", error);
            const errorMessage = error?.message || (typeof error === 'string' ? error : 'An unknown error occurred.');
            set({ scrapeState: { isScraping: false, status: `Error: ${errorMessage}` }});
        }
    },
    
    setSelectedSchedule: async (scheduleData) => {
        set({ schedulerError: null });
        const scheduleId = stringifySchedule(scheduleData);
        const { selectedScheduleId, schedules } = get();
        
        const newSelectedId = selectedScheduleId === scheduleId ? null : scheduleId;
        
        try {
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

    deleteSchedule: async (scheduleIdString, isCurrentlyFavorite) => {
        set({ currentHoveredSchedule: null, schedulerError: null });
        const originalState = {
            schedules: get().schedules,
            favoritedSchedules: get().favoritedSchedules,
            selectedScheduleId: get().selectedScheduleId,
            scheduleDisplayNumbers: get().scheduleDisplayNumbers,
        };

        set(state => {
            const newDisplayNumbers = new Map(state.scheduleDisplayNumbers);
            newDisplayNumbers.delete(scheduleIdString);
            return {
                schedules: state.schedules.filter(s => stringifySchedule(s) !== scheduleIdString),
                favoritedSchedules: state.favoritedSchedules.filter(s => stringifySchedule(s) !== scheduleIdString),
                selectedScheduleId: state.selectedScheduleId === scheduleIdString ? null : state.selectedScheduleId,
                scheduleDisplayNumbers: newDisplayNumbers,
            };
        });

        try {
            await schedulesAPI.delete(scheduleIdString, isCurrentlyFavorite);
            if (originalState.selectedScheduleId === scheduleIdString) {
                await systemAPI.setDisplaySchedule(null);
            }
            // Persist the updated numbers after deletion
            get()._persistScheduleNumbers();
        } catch (error) {
            console.error("Failed to delete schedule:", error);
            set({ 
                schedulerError: `Failed to delete schedule.`,
                ...originalState 
            });
        }
    },

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
    setHoveredSchedule: (scheduleData) => set({ currentHoveredSchedule: scheduleData }),
    clearHoveredSchedule: () => set({ currentHoveredSchedule: null }),
    showEventDetailsModal: (event) => set({ detailsEvent: event }),
    closeEventDetailsModal: () => set({ detailsEvent: null }),
    toggleRenderFavorites: () => set(state => ({ renderFavorites: !state.renderFavorites, currentHoveredSchedule: null })),
    setActiveTab: (tabName) => set({ activeTab: tabName }),
    toggleParamCheckbox: (boxName) => {
        set(state => ({
            paramCheckboxes: { ...state.paramCheckboxes, [boxName]: !state.paramCheckboxes[boxName] }
        }));
    },

    // Class Parameter Actions
    addClass: () => {
        const newClass = {
            id: `${Date.now().toString()}-${Math.random().toString(36).substring(2,9)}`,
            code: '', name: '', section: '', instructor: '',
        };
        set(state => ({ classes: [...state.classes, newClass] }));
    },
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