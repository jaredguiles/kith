import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useContacts } from '@/hooks/useContacts'
import { useEvents } from '@/hooks/useEvents'
import { reminders, importApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate, daysUntilBirthday } from '@/lib/utils'
import { Avatar } from '@/components/shared/Avatar'
import { Bell, Gift, Clock, Calendar, Upload, CheckCircle2 } from 'lucide-react'

type NotificationType = 'reminder' | 'birthday' | 'event' | 'import'

interface Notification {
  id: string
  type: NotificationType
  title: string
  description: string
  link?: string
  icon: React.ReactNode
  timestamp: string
  data?: any
}

export default function Notifications() {
  const navigate = useNavigate()
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  // Fetch contacts
  const { data: contactsData } = useContacts()
  const contactsList = contactsData?.contacts || []

  // Fetch due reminders
  const { data: dueReminders = [] } = useQuery({
    queryKey: ['reminders', 'due'],
    queryFn: () => reminders.due(),
  })

  // Fetch upcoming events (next 7 days)
  const { data: upcomingEventsList = [] } = useEvents({ upcoming: 'true', days: '7' })

  // Fetch import jobs awaiting review
  const { data: importJobs = [] } = useQuery({
    queryKey: ['import-jobs'],
    queryFn: importApi.jobs,
  })

  const notifications: Notification[] = useMemo(() => {
    const items: Notification[] = []

    // Overdue reminders
    dueReminders.forEach((reminder) => {
      const dueDate = new Date(reminder.due_at)
      const isOverdue = dueDate < new Date()
      items.push({
        id: `reminder-${reminder.id}`,
        type: 'reminder',
        title: reminder.title,
        description: isOverdue ? 'Overdue' : `Due on ${formatDate(reminder.due_at)}`,
        link: '/reminders',
        icon: <Clock className="h-5 w-5 text-orange-500" />,
        timestamp: reminder.created_at,
        data: reminder,
      })
    })

    // Upcoming birthdays (next 7 days)
    const now = new Date()
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    contactsList.forEach((contact) => {
      if (contact.birthday) {
        const daysUntil = daysUntilBirthday(contact.birthday)
        if (daysUntil >= 0 && daysUntil <= 7) {
          items.push({
            id: `birthday-${contact.id}`,
            type: 'birthday',
            title: `${contact.display_name}'s Birthday`,
            description: daysUntil === 0 ? 'Today!' : `In ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`,
            link: `/contacts/${contact.id}`,
            icon: <Gift className="h-5 w-5 text-pink-500" />,
            timestamp: contact.updated_at,
            data: contact,
          })
        }
      }
    })

    // Upcoming events (next 7 days)
    upcomingEventsList.forEach((event) => {
      const eventDate = new Date(event.starts_at)
      items.push({
        id: `event-${event.id}`,
        type: 'event',
        title: event.title,
        description: `On ${formatDate(event.starts_at)}`,
        link: `/events/${event.id}`,
        icon: <Calendar className="h-5 w-5 text-blue-500" />,
        timestamp: event.created_at,
        data: event,
      })
    })

    // Import jobs awaiting review
    importJobs.forEach((job) => {
      if (job.status === 'awaiting_review') {
        items.push({
          id: `import-${job.id}`,
          type: 'import',
          title: `Import Review: ${job.source_platform}`,
          description: `${job.total_records} records ready to review`,
          link: `/import-review/${job.id}`,
          icon: <Upload className="h-5 w-5 text-green-500" />,
          timestamp: job.created_at,
          data: job,
        })
      }
    })

    return items.filter((n) => !dismissedIds.has(n.id)).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [dueReminders, contactsList, upcomingEventsList, importJobs, dismissedIds])

  const notificationsByType = useMemo(() => {
    const grouped: Record<NotificationType, Notification[]> = {
      reminder: [],
      birthday: [],
      event: [],
      import: [],
    }
    notifications.forEach((n) => {
      grouped[n.type].push(n)
    })
    return grouped
  }, [notifications])

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]))
  }

  const handleMarkAllAsRead = () => {
    const allIds = new Set(notifications.map((n) => n.id))
    setDismissedIds(allIds)
  }

  const handleNotificationClick = (notification: Notification) => {
    if (notification.link) {
      navigate(notification.link)
    }
  }

  if (notifications.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="text-muted-foreground mt-2">Your notifications and reminders</p>
        </div>
        <EmptyState
          icon="Bell"
          title="All caught up!"
          description="You have no pending notifications"
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="text-muted-foreground mt-2">Your notifications and reminders</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleMarkAllAsRead}>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Mark All as Read
        </Button>
      </div>

      <div className="space-y-6">
        {/* Overdue Reminders */}
        {notificationsByType.reminder.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Reminders</h2>
            <div className="space-y-2">
              {notificationsByType.reminder.map((notif) => (
                <div
                  key={notif.id}
                  className="bg-card border border-border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors group"
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 pt-1">{notif.icon}</div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground group-hover:text-primary">{notif.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{notif.description}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDismiss(notif.id)
                      }}
                      className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Upcoming Birthdays */}
        {notificationsByType.birthday.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Birthdays</h2>
            <div className="space-y-2">
              {notificationsByType.birthday.map((notif) => (
                <div
                  key={notif.id}
                  className="bg-card border border-border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors group"
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="flex gap-4 items-center">
                    <div className="flex-shrink-0">
                      {notif.data?.photo_url && (
                        <Avatar contact={notif.data} size="sm" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground group-hover:text-primary">{notif.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{notif.description}</p>
                    </div>
                    <div className="flex-shrink-0 pt-1">{notif.icon}</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDismiss(notif.id)
                      }}
                      className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Upcoming Events */}
        {notificationsByType.event.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Upcoming Events</h2>
            <div className="space-y-2">
              {notificationsByType.event.map((notif) => (
                <div
                  key={notif.id}
                  className="bg-card border border-border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors group"
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 pt-1">{notif.icon}</div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground group-hover:text-primary">{notif.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{notif.description}</p>
                      {notif.data?.location && (
                        <p className="text-xs text-muted-foreground mt-1">📍 {notif.data.location}</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDismiss(notif.id)
                      }}
                      className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Import Jobs Awaiting Review */}
        {notificationsByType.import.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Import Jobs</h2>
            <div className="space-y-2">
              {notificationsByType.import.map((notif) => (
                <div
                  key={notif.id}
                  className="bg-card border border-border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors group"
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 pt-1">{notif.icon}</div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground group-hover:text-primary">{notif.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{notif.description}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDismiss(notif.id)
                      }}
                      className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
