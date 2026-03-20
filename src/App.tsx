import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { useAppStore } from '@/store/appStore'
import { queryClient } from '@/lib/queryClient'
import Layout from '@/components/layout/Layout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Contacts from '@/pages/Contacts'
import Events from '@/pages/Events'
import Groups from '@/pages/Groups'
import Notifications from '@/pages/Notifications'
import Settings from '@/pages/Settings'
import ImportReview from '@/pages/ImportReview'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAppStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { token, currentUser } = useAppStore()
  if (!token) return <Navigate to="/login" replace />
  if (currentUser?.role === 'user') return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="events" element={<Events />} />
            <Route path="groups" element={<Groups />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<AdminRoute><Settings /></AdminRoute>} />
            <Route path="import-review" element={<ImportReview />} />
            <Route path="import-review/:jobId" element={<ImportReview />} />
          </Route>
        </Routes>
        <Toaster theme="dark" position="bottom-right" />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
