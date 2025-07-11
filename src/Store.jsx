import { create } from 'zustand';
import { systemAPI, eventsAPI, schedulesAPI, favoritesAPI, classParametersAPI } from './api';

// Helper function to stringify schedules for use as unique keys
const stringifySchedule = (schedule) => {
    try {
        // A more stable stringify by sorting keys
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

// Helper function to add a new event to the processed events state object
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

// Helper function to remove an event from the processed events state object
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


const useStore = create((set, get) => ({
    // --- State ---
    isExpanded: false,
    userEvents: { eventsByDay: {}, noTimeEventsByDay: {} },
    schedules: [[]],
    favoritedSchedules: [],
    selectedScheduleId: null, // REFACTORED: from index to stable ID
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

    // Sidebar
    setIsExpanded: (value) => set({ isExpanded: value }),

    // Scheduler Display Number Helpers
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
    getScheduleDisplayNumber: (scheduleString) => {
        const state = get();
        return state.scheduleDisplayNumbers.get(scheduleString) || "?";
    },
    clearScrapeStatus: () => set({ scrapeState: { isScraping: false, status: "" }, schedulerError: null }),

    // Core Data Loading
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

            // REFACTORED: No longer need bitmaskToDayArray. Backend handles it.
            // We just send the event object as is.
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