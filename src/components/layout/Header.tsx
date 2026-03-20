import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'

export default function Header() {
  const navigate = useNavigate()
  const { currentUser, spicyMode, toggleSpicyMode, logout, setSidebarOpen, sidebarOpen } = useAppStore()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6">
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="p-2 hover:bg-muted rounded-md transition-colors"
      >
        ☰
      </button>

      <div className="flex items-center gap-4">
        <button
          onClick={toggleSpicyMode}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
            spicyMode ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground'
          }`}
        >
          🌶️ {spicyMode ? 'ON' : 'OFF'}
        </button>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{currentUser?.display_name}</span>
          <button
            onClick={handleLogout}
            className="px-3 py-1 text-sm font-medium bg-muted text-muted-foreground rounded-md hover:bg-secondary transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}
