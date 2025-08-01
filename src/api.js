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

/**
 * A wrapper for all credential-related API calls to the Rust backend.
 */
export const credentialsAPI = {
    /**
     * Checks if a master password has been set.
     * @returns {Promise<boolean>}
     */
    isMasterPasswordSet: () => invoke("is_master_password_set_cmd"),

    /**
     * Sets the initial master password.
     * @param {string} password - The master password to set.
     * @returns {Promise<void>}
     */
    setupMasterPassword: (password) =>
        invoke("setup_master_password_cmd", { password }),

    /**
     * Changes an existing master password.
     * @param {string} oldPassword - The current master password.
     * @param {string} newPassword - The new master password.
     * @returns {Promise<void>}
     */
    changeMasterPassword: (oldPassword, newPassword) =>
        invoke("change_master_password_cmd", { oldPassword, newPassword }),

    /**
     * Stores a username and application-specific password, authorized by the master password.
     * @param {string} username - The username to store.
     * @param {string} appPassword - The password to store.
     * @param {string} masterPassword - The authorizing master password.
     * @returns {Promise<void>}
     */
    storeCredentials: (username, appPassword, masterPassword) =>
        invoke("store_credentials_cmd", { username, appPassword, masterPassword }),

    /**
     * Retrieves the stored username and password, authorized by the master password.
     * @param {string} masterPassword - The authorizing master password.
     * @returns {Promise<[string, string]>} A tuple of [username, password].
     */
    getCredentials: (masterPassword) =>
        invoke("get_credentials_cmd", { masterPassword }),
};