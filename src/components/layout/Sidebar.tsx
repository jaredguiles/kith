import { Link } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'

export default function Sidebar() {
  const { sidebarOpen, currentUser } = useAppStore()

  const menuItems = [
    { label: 'Dashboard', path: '/', icon: '🏠' },
    { label: 'Contacts', path: '/contacts', icon: '👥' },
    { label: 'Events', path: '/events', icon: '📅' },
    { label: 'Groups', path: '/groups', icon: '👫' },
    { label: 'Notifications', path: '/notifications', icon: '🔔' },
    { label: 'Import Review', path: '/import-review', icon: '📥' },
  ]

  if (currentUser?.role !== 'user') {
    menuItems.push({ label: 'Settings', path: '/settings', icon: '⚙️' })
  }

  return (
    <div className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-card border-r border-border transition-all duration-200 flex flex-col`}>
      <div className="p-4 border-b border-border flex items-center justify-center h-16">
        <span className="text-2xl font-bold">K</span>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted text-sm font-medium transition-colors"
          >
            <span className="text-lg w-6">{item.icon}</span>
            {sidebarOpen && <span>{item.label}</span>}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="text-xs text-muted-foreground text-center">
          {sidebarOpen ? currentUser?.display_name : <span>👤</span>}
        </div>
      </div>
    </div>
  )
}
