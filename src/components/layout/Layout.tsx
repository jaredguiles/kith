import React, { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'
import { MobileHeader } from './MobileHeader'
import { CommandPalette } from './CommandPalette'
import { ImportWidget } from '@/components/shared/ImportWidget'
import { useAppStore } from '@/store/appStore'
import { auth } from '@/lib/api'

export default function Layout() {
  const { sidebarOpen, setSidebarOpen, setCurrentUser } = useAppStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await auth.me()
        setCurrentUser(user)
      } catch (error) {
        console.error('Failed to load user:', error)
      } finally {
        setLoading(false)
      }
    }

    loadUser()
  }, [setCurrentUser])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-950">
        <div className="animate-spin rounded-full h-12 w-12 border border-neutral-700 border-t-neutral-50" />
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-neutral-950 overflow-hidden">
      {/* Sidebar */}
      <AppSidebar open={sidebarOpen} />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden md:ml-0">
        {/* Mobile Header */}
        <MobileHeader onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette />

      {/* Import Widget */}
      <ImportWidget />
    </div>
  )
}
