import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Calendar,
  FolderOpen,
  Bell,
  Settings,
  ChevronDown,
  Plus,
  LogOut,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SpicyFlame } from '@/components/shared/SpicyFlame'
import { useAppStore } from '@/store/appStore'
import { groups as groupsApi } from '@/lib/api'
import type { Group } from '@/types'

interface AppSidebarProps {
  open: boolean
}

export function AppSidebar({ open }: AppSidebarProps) {
  const navigate = useNavigate()
  const { currentUser, spicyMode, toggleSpicyMode, setSidebarOpen, logout } = useAppStore()
  const [groupsList, setGroupsList] = useState<Group[]>([])
  const [groupsExpanded, setGroupsExpanded] = useState(true)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        setLoading(true)
        const data = await groupsApi.list()
        setGroupsList(data.slice(0, 5))
      } catch (error) {
        console.error('Failed to fetch groups:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchGroups()
  }, [])

  const navItems = [
    { label: 'Home', path: '/', icon: LayoutDashboard },
    { label: 'Contacts', path: '/contacts', icon: Users },
    { label: 'Events', path: '/events', icon: Calendar },
    { label: 'Groups', path: '/groups', icon: FolderOpen },
    { label: 'Notifications', path: '/notifications', icon: Bell },
  ]

  if (currentUser?.role !== 'user') {
    navItems.push({ label: 'Settings', path: '/settings', icon: Settings })
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div
      className={`${
        open ? 'w-64' : 'w-20'
      } bg-neutral-950 border-r border-neutral-700 transition-all duration-200 flex flex-col h-screen overflow-hidden fixed left-0 top-0 z-40 md:relative md:z-0`}
    >
      {/* Logo Section */}
      <div className="h-16 border-b border-neutral-700 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="text-2xl font-bold text-neutral-50">◆</div>
          {open && <span className="text-lg font-semibold text-neutral-50">Kith</span>}
        </div>
        {open && spicyMode && <SpicyFlame enabled={true} size="sm" />}
      </div>

      {/* Search and New Button */}
      {open && (
        <div className="p-4 border-b border-neutral-700 space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start text-neutral-400 text-sm"
            onClick={() => {
              const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true })
              document.dispatchEvent(event)
            }}
          >
            <Search size={16} className="mr-2" />
            <span className="flex-1 text-left">⌘K</span>
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start text-neutral-200 hover:bg-neutral-800"
            onClick={() => navigate('/contacts?new=true')}
          >
            <Plus size={16} className="mr-2" />
            New person
          </Button>
        </div>
      )}

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-2">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-neutral-800 text-neutral-300 hover:text-neutral-50 transition-colors text-sm font-medium"
            title={!open ? item.label : undefined}
          >
            <item.icon size={20} className="shrink-0" />
            {open && <span>{item.label}</span>}
          </Link>
        ))}
      </nav>

      {/* Groups Section */}
      {open && (
        <div className="border-t border-neutral-700 p-4">
          <button
            onClick={() => setGroupsExpanded(!groupsExpanded)}
            className="flex items-center justify-between w-full text-xs font-semibold text-neutral-400 hover:text-neutral-200 mb-3"
          >
            <span>GROUPS</span>
            <ChevronDown size={14} className={`transition-transform ${groupsExpanded ? 'rotate-180' : ''}`} />
          </button>

          {groupsExpanded && (
            <div className="space-y-2">
              {groupsList.map((group) => (
                <Link
                  key={group.id}
                  to={`/groups/${group.id}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-neutral-800 text-neutral-300 hover:text-neutral-50 transition-colors text-sm"
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: group.color || '#6b7280' }}
                  />
                  <span className="flex-1 truncate">{group.name}</span>
                  {group.member_count && <span className="text-xs text-neutral-500">({group.member_count})</span>}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom User Section */}
      <div className="border-t border-neutral-700 p-4 space-y-3">
        {open && currentUser && (
          <>
            <div className="text-xs">
              <p className="font-medium text-neutral-50 truncate">{currentUser.display_name}</p>
              <p className="text-neutral-500 capitalize">{currentUser.role.replace('_', ' ')}</p>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
              onClick={handleLogout}
            >
              <LogOut size={16} className="mr-2" />
              Logout
            </Button>
          </>
        )}
        {!open && (
          <button
            onClick={handleLogout}
            className="w-full flex justify-center hover:bg-neutral-800 p-2 rounded-md text-neutral-400 hover:text-neutral-200 transition-colors"
            title="Logout"
          >
            <LogOut size={20} />
          </button>
        )}
      </div>

      {/* Mobile toggle button */}
      <div className="md:hidden border-t border-neutral-700 p-2 flex justify-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!open)}
          className="text-neutral-400 hover:text-neutral-200"
        >
          <ChevronDown size={20} className={`transition-transform ${open ? 'rotate-90' : '-rotate-90'}`} />
        </Button>
      </div>
    </div>
  )
}
