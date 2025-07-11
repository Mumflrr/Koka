// src/api.js
import { invoke } from "@tauri-apps/api/tauri";

/**
 * A wrapper around Tauri's invoke function to centralize calls and prevent leaky apis
 * @param {string} command - The Rust command to invoke.
 * @param {object} [args] - The arguments to pass to the command.
 * @returns {Promise<any>} - A promise that resolves with the result of the Rust command.
 */
async function invokeWrapper(command, args) {
  try {
    return await invoke(command, args);
  } catch (error) {
    console.error(`Error invoking Tauri command '${command}':`, error, "Args:", args);
    throw error;
  }
}

// --- System & Setup Commands (data table) ---
export const systemAPI = {
  startupApp() {
    return invokeWrapper('startup_app');
  },
  closeSplashscreen() {
    return invokeWrapper('close_splashscreen');
  },
  showSplashscreen() {
    return invokeWrapper('show_splashscreen');
  },
  getDisplaySchedule() {
    return invokeWrapper('get_display_schedule');
  },
  setDisplaySchedule(scheduleIndex) {
    // Backend still uses index for now, so we pass it.
    // If backend is updated to use ID, this would change.
    return invokeWrapper('set_display_schedule', { id: scheduleIndex });
  }
};

// --- Events Table API (REFACTORED) ---
export const eventsAPI = {
  // Now sends 'eventData' and expects the full event object in return
  create(eventData) {
    return invokeWrapper('create_event', { eventData });
  },
  // No longer needs a table name
  getAll() {
    return invokeWrapper('get_events');
  },
  // No longer needs a table name
  update(eventData) {
    return invokeWrapper('update_event', { event: eventData });
  },
  // No longer needs a table name
  delete(eventId) {
    return invokeWrapper('delete_event', { eventId });
  }
};

// --- Schedules Table API ---
export const schedulesAPI = {
  generate(parameters) {
    return invokeWrapper('generate_schedules', { parameters });
  },
  getAll() {
    return invokeWrapper('get_schedules', { table: 'schedules' });
  },
  delete(scheduleIdString, isFavorited) {
    return invokeWrapper('delete_schedule', { id: scheduleIdString, isFavorited });
  }
};

// --- Favorites Table API ---
export const favoritesAPI = {
  getAll() {
    return invokeWrapper('get_schedules', { table: 'favorites' });
  },
  changeFavorite(scheduleIdString, isFavorited, scheduleData) {
    return invokeWrapper('change_favorite_schedule', { id: scheduleIdString, isFavorited, schedule: scheduleData });
  }
};

// --- Class Parameters Table API ---
export const classParametersAPI = {
  getAll() {
    return invokeWrapper('get_classes');
  },
  update(classData) {
    return invokeWrapper('update_class', { class: classData });
  },
  remove(classId) {
    return invokeWrapper('remove_class', { id: classId });
  }
};