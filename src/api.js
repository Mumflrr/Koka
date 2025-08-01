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
    return invokeWrapper('set_display_schedule', { id: scheduleIndex });
  }
};

// --- Events Table API (REFACTORED) ---
export const eventsAPI = {
  create(eventData) {
    return invokeWrapper('create_event', { eventData });
  },
  getAll() {
    return invokeWrapper('get_events');
  },
  update(eventData) {
    return invokeWrapper('update_event', { event: eventData });
  },
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

export const credentialsAPI = {
  /**
   * Sets the master password for the application.
   * @param {string} password - The user's chosen master password.
   * @returns {Promise<void>}
   */
  setupMasterPassword(password) {
    return invokeWrapper('setup_password', { password });
  },

  /**
   * Securely stores a secret value, like an API key.
   * @param {string} keyName - The name to identify the secret (e.g., 'google_calendar_api_key').
   * @param {string} secretValue - The actual secret to store.
   * @returns {Promise<void>}
   */
  storeSecret(keyName, secretValue) {
    return invokeWrapper('store_secret', { keyName, secretValue });
  },

  /**
   * Retrieves a secret after getting authorization via the master password.
   * @param {string} keyName - The name of the secret to retrieve.
   * @param {string} masterPassword - The master password for verification.
   * @returns {Promise<string>} - A promise that resolves with the secret value.
   */
  getSecretWithAuthorization(keyName, masterPassword) {
    return invokeWrapper('get_secret', { keyName, masterPassword });
  }
};