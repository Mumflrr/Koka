import { invoke } from '@tauri-apps/api/tauri'
import { create } from 'zustand'

const useStore = create((set, get) => ({
    // Initial state
    isExpanded: false,
    scrapingProgress: 0,
    scrapedData: [],
    error: null,
    isLoading: false,

    // Simple state setter
    setIsExpanded: (value) => set({ isExpanded: value }),

    // Complex async operation
    fetchAllData: async () => {
    // First, update loading state
    set({ isLoading: true })

    try {
        // Make async call
        const data = await invoke('fetch_all_data')
        
        // Update state with result
        set({ 
        scrapedData: data,
        error: null  // Clear any previous errors
        })
    } catch (error) {
        // Handle error case
        set({ error: error.toString() })
    } finally {
        // Always reset loading state
        set({ isLoading: false })
    }
    },

    // Operation that depends on current state
    startScraping: async (url) => {
    // Get current state
    const currentData = get().scrapedData

    set({ isScrapingActive: true, error: null })
    
    try {
        const newData = await invoke('start_scrape', { url })
        
        // Update using both new and existing data
        set({ 
        scrapedData: [...currentData, newData]
        })
        
        // Call another store function
        await get().saveData(newData)
    } catch (error) {
        set({ error: error.toString() })
    } finally {
        set({ isScrapingActive: false })
    }
    }
}))

export default useStore