import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '@/store/appStore'
import { useContacts } from '@/hooks/useContacts'
import { useEvents } from '@/hooks/useEvents'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/shared/Avatar'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate, daysUntilBirthday } from '@/lib/utils'
import { reminders } from '@/lib/api'
import { LayoutDashboard, Users, Calendar, Bell, Gift, Clock, Activity, CheckCircle2 } from 'lucide-react'

export default function Dashboard() {
  const navigate = useNavigate()
  const { currentUser } = useAppStore()
  const [completingReminderId, setCompletingReminderId] = useState<number | null>(null)

  // Fetch contacts
  const { data: contactsData, isLoading: contactsLoading } = useContacts()
  const contactsList = contactsData?.contacts || []

  // Fetch events
  const { data: eventsList = [], isLoading: eventsLoading } = useEvents({ upcoming: 'true' })

  // Fetch due reminders
  const { data: dueRemindersList = [], isLoading: remindersLoading } = useQuery({
    queryKey: ['reminders', 'due'],
    queryFn: () => reminders.due(),
  })

  // Calculate stats
  const totalContacts = contactsList.length
  const contactsThisMonth = useMemo(() => {
    const now = new Date()
    const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1)
    return contactsList.filter(c => {
      const createdAt = new Date(c.created_at)
      return createdAt >= monthAgo
    }).length
  }, [contactsList])

  const eventsThisMonth = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return eventsList.filter(e => {
      const eventDate = new Date(e.date || e.start_date)
      return eventDate >= monthStart && eventDate <= monthEnd
    }).length
  }, [eventsList])

  const overdueReminders = dueRemindersList.filter(r => {
    const dueDate = new Date(r.due_date)
    return dueDate < new Date()
  }).length

  // Get upcoming birthdays (next 30 days)
  const upcomingBirthdays = useMemo(() => {
    return contactsList
      .filter(c => c.birthday)
      .map(c => ({
        contact: c,
        daysUntil: daysUntilBirthday(c.birthday!),
      }))
      .filter(({ daysUntil }) => daysUntil <= 30 && daysUntil >= 0)
      .sort((a, b) => a.daysUntil - b.daysUntil)
  }, [contactsList])

  // Get upcoming events (next 5)
  const upcomingEvents = eventsList.slice(0, 5)

  // Get recent activity (last 10 contacts sorted by updated_at)
  const recentActivity = useMemo(() => {
    return [...contactsList]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 10)
  }, [contactsList])

  const handleCompleteReminder = async (id: number) => {
    setCompletingReminderId(id)
    try {
      await reminders.complete(id)
    } catch (e) {
      console.error('Failed to complete reminder:', e)
    } finally {
      setCompletingReminderId(null)
    }
  }

  const getTimeAgo = (date: string) => {
    const now = new Date()
    const updated = new Date(date)
    const diffMs = now.getTime() - updated.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 30) return `${diffDays}d ago`
    return formatDate(date)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-neutral-400 mt-2">Welcome back, {currentUser?.display_name}!</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-400">Total Contacts</p>
                <p className="text-3xl font-bold mt-2">{totalContacts}</p>
              </div>
              <Users className="w-8 h-8 text-neutral-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-400">Added This Month</p>
                <p className="text-3xl font-bold mt-2">{contactsThisMonth}</p>
              </div>
              <Users className="w-8 h-8 text-neutral-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-400">Events This Month</p>
                <p className="text-3xl font-bold mt-2">{eventsThisMonth}</p>
              </div>
              <Calendar className="w-8 h-8 text-neutral-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-400">Overdue Reminders</p>
                <p className="text-3xl font-bold mt-2">{overdueReminders}</p>
              </div>
              <Bell className="w-8 h-8 text-neutral-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Birthdays */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5" />
              Upcoming Birthdays
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingBirthdays.length === 0 ? (
              <EmptyState
                icon={Gift}
                title="No upcoming birthdays"
                description="Birthdays in the next 30 days will appear here"
              />
            ) : (
              <div className="space-y-3">
                {upcomingBirthdays.map(({ contact, daysUntil }) => (
                  <div key={contact.id} className="flex items-center justify-between p-3 rounded-lg bg-neutral-900">
                    <div className="flex items-center gap-3 flex-1">
                      <Avatar contact={contact} size="sm" />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{contact.display_name}</p>
                        <p className="text-xs text-neutral-400">{formatDate(contact.birthday)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-neutral-300">
                        {daysUntil === 0 ? 'Today!' : `in ${daysUntil}d`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Due Reminders */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Due Reminders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dueRemindersList.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No reminders due"
                description="You're all caught up!"
              />
            ) : (
              <div className="space-y-3">
                {dueRemindersList.slice(0, 5).map((reminder) => (
                  <div key={reminder.id} className="p-3 rounded-lg bg-neutral-900 border border-neutral-800">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{reminder.title}</p>
                        {reminder.description && (
                          <p className="text-xs text-neutral-400 mt-1">{reminder.description}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCompleteReminder(reminder.id)}
                        disabled={completingReminderId === reminder.id}
                        className="h-8 w-8 p-0"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-neutral-500">Due: {formatDate(reminder.due_date)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Events */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Upcoming Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingEvents.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="No upcoming events"
                description="Events will appear here"
                action={{ label: 'Create Event', onClick: () => navigate('/events') }}
              />
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map((event) => (
                  <div
                    key={event.id}
                    className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 cursor-pointer hover:border-neutral-700 transition-colors"
                    onClick={() => navigate('/events')}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{event.title}</p>
                        {event.event_type && (
                          <div className="inline-block mt-1">
                            <span className="px-2 py-1 rounded text-xs bg-neutral-800 text-neutral-300">
                              {event.event_type}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-neutral-500">
                      {formatDate(event.date || event.start_date)}
                      {event.time && ` at ${event.time}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="No activity yet"
                description="Your recent contacts will appear here"
              />
            ) : (
              <div className="space-y-3">
                {recentActivity.map((contact) => (
                  <div key={contact.id} className="flex items-center justify-between p-3 rounded-lg bg-neutral-900">
                    <div className="flex items-center gap-3 flex-1">
                      <Avatar contact={contact} size="sm" />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{contact.display_name}</p>
                      </div>
                    </div>
                    <p className="text-xs text-neutral-500">{getTimeAgo(contact.updated_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
