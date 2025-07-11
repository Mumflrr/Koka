import { create } from 'zustand';
import { systemAPI, eventsAPI, schedulesAPI, favoritesAPI, classParametersAPI } from './api'

// Helper functions (moved from Scheduler.jsx or similar)
// TODO: Prevent duplicate class params from being typed in
const stringifySchedule = (schedule) => {
    try {
        return JSON.stringify(schedule);
    } catch (e) {
        console.error("Failed to stringify schedule:", schedule, e);
        return null;
    }
};

const bitmaskToDayArray = (dayBitmask) => {
    const dayArray = [false, false, false, false, false]; // Mon, Tue, Wed, Thu, Fri
    for (let i = 0; i < 5; i++) { // i = 0 for Monday, 1 for Tuesday, ...
        if ((dayBitmask & (1 << (i + 1))) !== 0) { // (1<<(i+1)) gives Mon=2, Tue=4, ...
            dayArray[i] = true;
        }
    }
    return dayArray;
};

// Generate a unique ID for events
const generateEventId = () => {
    return `event-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

const useStore = create((set, get) => ({
    // Initial state from Sidebar
    isExpanded: false,

    // Scheduler state
    userEvents: [],
    schedules: [[]],
    favoritedSchedules: [],
    selectedScheduleIndex: null,
    currentHoveredSchedule: null,
    detailsEvent: null,
    schedulerLoading: true,
    schedulerError: null,
    scrapeState: {
        isScraping: false,
        status: "",
    },
    paramCheckboxes: {
        box1: false,
        box2: false,
    },
    classes: [],
    activeTab: 'schedules',
    renderFavorites: false,
    // New: mapping of schedule strings to stable display numbers
    scheduleDisplayNumbers: new Map(),
    nextScheduleNumber: 1,

    // Sidebar actions
    setIsExpanded: (value) => set({ isExpanded: value }),

    // Helper function to assign stable display numbers to schedules
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

    // Helper function to get display number for a schedule
    getScheduleDisplayNumber: (scheduleString) => {
        const state = get();
        return state.scheduleDisplayNumbers.get(scheduleString) || "?";
    },

    clearScrapeStatus: () => {
        set({ 
            scrapeState: { isScraping: false, status: "" }, 
            schedulerError: null 
        });
    },

    // Scheduler actions
    _updateSchedulerData: async (calledFromGenerate = false) => {
        try {
            // This now returns ProcessedEventsResult instead of raw events
            const loadedEventsResult = await eventsAPI.getAll();
            const loadedSchedules = await schedulesAPI.getAll();
            const loadedFavorites = await favoritesAPI.getAll();

            const finalSchedules = (Array.isArray(loadedSchedules) && loadedSchedules.length > 0) ? loadedSchedules : [[]];
            
            get()._assignScheduleDisplayNumbers(finalSchedules);

            set(state => ({
                userEvents: loadedEventsResult || { eventsByDay: {}, noTimeEventsByDay: {} }, // Now expects processed format
                schedules: finalSchedules,
                favoritedSchedules: (Array.isArray(loadedFavorites) && loadedFavorites.length > 0) ? loadedFavorites : [],
                schedulerError: calledFromGenerate ? state.schedulerError : null,
            }));
        } catch (err) {
            console.error('Error refreshing scheduler data:', err);
            set(state => ({ schedulerError: state.schedulerError || 'Failed to refresh some schedule data.' }));
        }
    },

    loadSchedulerPage: async () => {
        set({ schedulerLoading: true, schedulerError: null });
        try {
            await get()._updateSchedulerData();

            const loadedSelectedSchedule = await systemAPI.getDisplaySchedule();
            const loadedClasses = await classParametersAPI.getAll();

            set({
                selectedScheduleIndex: loadedSelectedSchedule,
                classes: loadedClasses || [],
                schedulerLoading: false,
            });
        } catch (err) {
            console.error('Error loading scheduler page data:', err);
            set({
                schedulerError: 'Failed to load schedule data. Please try again later.',
                userEvents: [],
                schedules: [[]],
                favoritedSchedules: [],
                classes: [],
                schedulerLoading: false,
            });
        }
    },

    createUserEvent: async (newEventData) => {
        set({ schedulerError: null });
        
        // Validate that newEventData is not null/undefined
        if (!newEventData) {
            console.error('Error: newEventData is null or undefined');
            set({ schedulerError: 'Failed to save event: Invalid event data.' });
            return;
        }

        // Generate ID if not provided
        if (!newEventData.id) {
            newEventData.id = generateEventId();
        }

        // Validate required Event fields based on Rust struct (excluding id since we generate it)
        const requiredFields = ['title', 'startTime', 'endTime', 'day'];
        const missingFields = requiredFields.filter(field => 
            newEventData[field] === undefined || newEventData[field] === null
        );
        
        if (missingFields.length > 0) {
            console.error('Error: Missing required fields:', missingFields);
            set({ schedulerError: `Failed to save event: Missing required fields: ${missingFields.join(', ')}` });
            return;
        }

        // Ensure all required fields have proper defaults
        const eventToSave = {
            id: newEventData.id,
            title: newEventData.title,
            startTime: newEventData.startTime,
            endTime: newEventData.endTime,
            day: newEventData.day,
            professor: newEventData.professor || '',
            description: newEventData.description || '',
        };

        try {
            // create_event returns void, not the created event
            await eventsAPI.create(eventToSave);
            
            // Since create_event returns void, we need to refresh the data to get the updated list
            await get()._updateSchedulerData();
        } catch (err) {
            console.error('Error saving event:', err);
            set({ schedulerError: 'Failed to save event. Please try again.' });
            await get()._updateSchedulerData(); // Re-fetch to ensure consistency on error
        }
    },

    updateUserEvent: async (updatedEventData) => {
        set({ schedulerError: null });
        
        // Validate that updatedEventData is not null/undefined
        if (!updatedEventData) {
            console.error('Error: updatedEventData is null or undefined');
            set({ schedulerError: 'Failed to update event: Invalid event data.' });
            return;
        }

        // Validate that the event has an ID (required for updates)
        if (!updatedEventData.id) {
            console.error('Error: updatedEventData missing id field');
            set({ schedulerError: 'Failed to update event: Event ID is required for updates.' });
            return;
        }

        const originalUserEvents = get().userEvents;
        
        // Optimistically update the UI
        set(state => ({
            userEvents: state.userEvents.map(e => e.id === updatedEventData.id ? updatedEventData : e)
        }));
        
        try {
            await eventsAPI.update(updatedEventData);
        } catch (err) {
            console.error('Error updating event:', err);
            set({ schedulerError: 'Failed to update event. Please try again.', userEvents: originalUserEvents });
            // Refresh data to ensure consistency on error
            await get()._updateSchedulerData();
        }
    },

    deleteUserEvent: async (eventId) => {
        set({ schedulerError: null });
        
        if (!eventId) {
            console.error('Error: eventId is null or undefined');
            set({ schedulerError: 'Failed to delete event: Invalid event ID.' });
            throw new Error('Invalid event ID');
        }

        try {
            // Call backend to delete event
            await eventsAPI.delete(eventId);
            
            // Update UI after successful backend deletion
            set(state => ({ userEvents: state.userEvents.filter(e => e.id !== eventId) }));
        } catch (err) {
            console.error('Error deleting event:', err);
            set({ schedulerError: 'Failed to delete event. Please try again.' });
            throw err; // Re-throw so CalendarGrid knows deletion failed
        }
    },

    generateSchedules: async () => {
    set({ scrapeState: { isScraping: true, status: "Starting scrape..." }, schedulerError: null });
    const { paramCheckboxes, classes, userEvents } = get();
    try {
        // Extract raw events from the processed structure
        const rawUserEvents = [];
        
        // Extract events from eventsByDay
        if (userEvents.eventsByDay) {
            Object.values(userEvents.eventsByDay).forEach(dayEvents => {
                dayEvents.forEach(event => {
                    // Only add if we haven't already added this event (avoid duplicates from multiple days)
                    if (!rawUserEvents.find(existing => existing.id === event.id)) {
                        rawUserEvents.push({
                            id: event.id,
                            title: event.title,
                            startTime: event.startTime,
                            endTime: event.endTime,
                            day: event.day,
                            professor: event.professor,
                            description: event.description
                        });
                    }
                });
            });
        }
        
        // Extract events from noTimeEventsByDay
        if (userEvents.noTimeEventsByDay) {
            Object.values(userEvents.noTimeEventsByDay).forEach(dayEvents => {
                dayEvents.forEach(event => {
                    // Only add if we haven't already added this event (avoid duplicates from multiple days)
                    if (!rawUserEvents.find(existing => existing.id === event.id)) {
                        rawUserEvents.push({
                            id: event.id,
                            title: event.title,
                            startTime: event.startTime,
                            endTime: event.endTime,
                            day: event.day,
                            professor: event.professor,
                            description: event.description
                        });
                    }
                });
            });
        }

        const formattedUserEventsForScrape = rawUserEvents.map(event => ({
            time: [event.startTime, event.endTime],
            days: bitmaskToDayArray(event.day)
        }));

        const result = await schedulesAPI.generate({
            params_checkbox: [paramCheckboxes.box1, paramCheckboxes.box2, false],
            classes: classes,
            events: formattedUserEventsForScrape
        });

        if (typeof result === 'string') {
            console.error("Scrape error:", result);
            set({ 
                scrapeState: { isScraping: false, status: `Error: ${result}` }, 
                schedules: [[]], // Keep existing favorites
            });
        } else {
            console.log("Scrape successful, result:", result);
            set({ 
                scrapeState: { isScraping: false, status: "Schedules generated successfully!" },
                schedules: result || [[]],
            });
            get()._assignScheduleDisplayNumbers(result || [[]]);
        }
    } catch (error) {
        console.error("Error during schedule generation:", error);
        set({ 
            scrapeState: { isScraping: false, status: `Error: ${error.message}` },
            schedules: [[]],
        });
    }
},

    toggleFavoriteSchedule: async (scheduleData, scheduleString, isCurrentlyFavorite) => {
        set(state => ({ 
            schedulerError: null,
            currentHoveredSchedule: state.renderFavorites ? null : state.currentHoveredSchedule 
        }));
        try {
            // Fix: Pass parameters individually instead of as an object
            await favoritesAPI.changeFavorite(scheduleString, isCurrentlyFavorite, scheduleData);
            const loadedFavorites = await favoritesAPI.getAll();
            set({
                favoritedSchedules: (Array.isArray(loadedFavorites) && loadedFavorites.length > 0) ? loadedFavorites : [],
            });
        } catch (error) {
            console.error("Failed to update favorite status:", error);
            set({ schedulerError: `Failed to update favorite status.` });
            const loadedFavorites = await favoritesAPI.getAll();
            set({ favoritedSchedules: (Array.isArray(loadedFavorites) && loadedFavorites.length > 0) ? loadedFavorites : [] });
        }
    },

    deleteSchedule: async (scheduleIdString, isCurrentlyFavorite) => {
        set({ currentHoveredSchedule: null, schedulerError: null });
        try {
            await schedulesAPI.delete(scheduleIdString, isCurrentlyFavorite);
            
            // Remove the deleted schedule's display number mapping
            set(state => {
                const newMapping = new Map(state.scheduleDisplayNumbers);
                newMapping.delete(scheduleIdString);
                return { scheduleDisplayNumbers: newMapping };
            });
            
            await get()._updateSchedulerData();
            
            const { schedules, selectedScheduleIndex } = get();
            let newSelectedScheduleIndex = selectedScheduleIndex;

            if (selectedScheduleIndex !== null) {
                const currentSelectedSchedule = schedules[selectedScheduleIndex];
                if (!currentSelectedSchedule || stringifySchedule(currentSelectedSchedule) === scheduleIdString) {
                    newSelectedScheduleIndex = null;
                } else {
                    // If the deleted schedule was before the selected one, the index might need adjustment
                    // This is complex if not just re-fetching. For simplicity, _updateSchedulerData handles fetching.
                    // If selected schedule is now gone, clear it.
                    const stillExists = schedules.find(s => stringifySchedule(s) === stringifySchedule(currentSelectedSchedule));
                    if (!stillExists) newSelectedScheduleIndex = null;

                }
            }
             if (newSelectedScheduleIndex !== selectedScheduleIndex) {
                 set({ selectedScheduleIndex: newSelectedScheduleIndex });
                 if (newSelectedScheduleIndex === null) {
                    await systemAPI.setDisplaySchedule(null);
                 }
             }


        } catch (error) {
            console.error("Failed to delete schedule:", error);
            set({ schedulerError: `Failed to delete schedule.` });
            await get()._updateSchedulerData();
        }
    },

    setSelectedSchedule: async (scheduleIndex) => {
        set({ schedulerError: null });
        const currentSelected = get().selectedScheduleIndex;
        const newSelectedScheduleIndex = currentSelected === scheduleIndex ? null : scheduleIndex;
        try {
            await systemAPI.setDisplaySchedule(newSelectedScheduleIndex);
            set({ selectedScheduleIndex: newSelectedScheduleIndex, currentHoveredSchedule: null });
        } catch (error) {
            console.error("Failed to set display schedule:", error);
            set({ schedulerError: "Failed to pin schedule." });
        }
    },
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

    addClass: () => {
        const newClass = {
            id: `${Date.now().toString()}-${Math.random().toString(36).substring(2,9)}`,
            code: '', name: '', section: '', instructor: '',
        };
        set(state => ({ classes: [...state.classes, newClass] }));
    },
    updateClass: async (classData) => {
        set({ schedulerError: null });
        
        if (!classData) {
            console.error('Error: classData is null or undefined');
            set({ schedulerError: 'Failed to update class: Invalid class data.' });
            return;
        }

        const originalClasses = [...get().classes];
        
        // Optimistically update the UI
        set(state => ({
            classes: state.classes.map(item => item.id === classData.id ? { ...classData } : item)
        }));
        
        try {
            // The Rust backend returns void on success, not the updated class
            await classParametersAPI.update(classData);

        } catch (err) {
            console.error("Error updating class:", err);
            set({ schedulerError: 'Failed to update class.', classes: originalClasses });
        }
    },
    deleteClass: async (classId) => {
        set({ schedulerError: null });
        
        if (!classId) {
            console.error('Error: classId is null or undefined');
            set({ schedulerError: 'Failed to delete class: Invalid class ID.' });
            return;
        }

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