import { create } from 'zustand'

//TODO implement scraping progress

const useStore = create((set, get) => ({
    // Initial state
    isExpanded: false,
    scrapingProgress: 0,

    // Simple state setter
    setIsExpanded: (value) => set({ isExpanded: value }),

}))

export default useStore