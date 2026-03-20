import { create } from 'zustand'
import type { User } from '@/types'

interface AppState {
  token: string | null
  currentUser: User | null
  spicyMode: boolean
  sidebarOpen: boolean
  setToken: (token: string | null) => void
  setCurrentUser: (user: User | null) => void
  setSpicyMode: (on: boolean) => void
  toggleSpicyMode: () => void
  setSidebarOpen: (open: boolean) => void
  logout: () => void
}

export const useAppStore = create<AppState>((set) => ({
  token: localStorage.getItem('kith_token'),
  currentUser: null,
  spicyMode: localStorage.getItem('kith_spicy') === 'true',
  sidebarOpen: true,
  setToken: (token) => {
    if (token) localStorage.setItem('kith_token', token)
    else localStorage.removeItem('kith_token')
    set({ token })
  },
  setCurrentUser: (user) => set({ currentUser: user }),
  setSpicyMode: (on) => {
    localStorage.setItem('kith_spicy', String(on))
    set({ spicyMode: on })
  },
  toggleSpicyMode: () =>
    set((s) => {
      const next = !s.spicyMode
      localStorage.setItem('kith_spicy', String(next))
      return { spicyMode: next }
    }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  logout: () => {
    localStorage.removeItem('kith_token')
    localStorage.removeItem('kith_spicy')
    set({ token: null, currentUser: null, spicyMode: false })
  },
}))
