import { useState, useMemo } from 'react'
import { useEvents, useCreateEvent, useUpdateEvent, useDeleteEvent } from '@/hooks/useEvents'
import { useContacts } from '@/hooks/useContacts'
import { useAppStore } from '@/store/appStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Avatar } from '@/components/shared/Avatar'
import { SpicyFlame } from '@/components/shared/SpicyFlame'
import { StarRating } from '@/components/shared/StarRating'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDateTime, formatDate, EVENT_TYPES } from '@/lib/utils'
import { Contact, Event } from '@/types'
import { Plus, Trash2, PenLine, Check } from 'lucide-react'

interface EventFormData {
  title: string
  type: string
  description: string
  location: string
  starts_at: string
  ends_at: string
  is_spicy: boolean
  contact_ids: number[]
}

type EventStatus = 'upcoming' | 'completed' | 'cancelled'

function EventFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  event,
  contacts,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: EventFormData) => Promise<void>
  isLoading: boolean
  event?: Event | null
  contacts: Contact[]
}) {
  const [formData, setFormData] = useState<EventFormData>({
    title: event?.title || '',
    type: event?.type || '',
    description: event?.description || '',
    location: event?.location || '',
    starts_at: event?.starts_at || '',
    ends_at: event?.ends_at || '',
    is_spicy: event?.is_spicy || false,
    contact_ids: event?.contacts?.map(c => c.id) || [],
  })

  const [openContactPopover, setOpenContactPopover] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const toggleContact = (contactId: number) => {
    setFormData(prev => ({
      ...prev,
      contact_ids: prev.contact_ids.includes(contactId)
        ? prev.contact_ids.filter(id => id !== contactId)
        : [...prev.contact_ids, contactId],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await onSubmit(formData)
      setFormData({
        title: '',
        type: '',
        description: '',
        location: '',
        starts_at: '',
        ends_at: '',
        is_spicy: false,
        contact_ids: [],
      })
      onOpenChange(false)
    } catch (error) {
      console.error('Form submission error:', error)
    }
  }

  const selectedContacts = contacts.filter(c => formData.contact_ids.includes(c.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event ? 'Edit Event' : 'Create Event'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                placeholder="Event title"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select value={formData.type} onValueChange={(value) => handleSelectChange('type', value)}>
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map(type => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  placeholder="Location"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="starts_at">Start Date & Time</Label>
                <Input
                  id="starts_at"
                  name="starts_at"
                  type="datetime-local"
                  value={formData.starts_at}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ends_at">End Date & Time</Label>
                <Input
                  id="ends_at"
                  name="ends_at"
                  type="datetime-local"
                  value={formData.ends_at}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Event description"
                className="w-full h-20 px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <SpicyFlame
                  enabled={formData.is_spicy}
                  onChange={(enabled) => setFormData(prev => ({ ...prev, is_spicy: enabled }))}
                  size="md"
                />
                Mark as spicy
              </Label>
            </div>

            {/* Contact Picker */}
            {contacts.length > 0 && (
              <div className="space-y-2">
                <Label>Linked Contacts</Label>
                <Popover open={openContactPopover} onOpenChange={setOpenContactPopover}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      {selectedContacts.length > 0
                        ? `${selectedContacts.length} contact(s) selected`
                        : 'Select contacts'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-3" side="top">
                    <Command>
                      <CommandInput placeholder="Search contacts..." />
                      <CommandList>
                        <CommandEmpty>No contacts found.</CommandEmpty>
                        <CommandGroup>
                          {contacts.map(contact => (
                            <CommandItem
                              key={contact.id}
                              value={String(contact.id)}
                              onSelect={() => toggleContact(contact.id)}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${
                                  formData.contact_ids.includes(contact.id) ? 'opacity-100' : 'opacity-0'
                                }`}
                              />
                              {contact.display_name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {selectedContacts.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedContacts.map(contact => (
                      <div key={contact.id} className="flex items-center gap-2 bg-secondary rounded-lg px-2 py-1">
                        <Avatar contact={contact} size="sm" />
                        <span className="text-sm">{contact.display_name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? 'Saving...' : 'Save Event'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EventCard({
  event,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  event: Event
  onEdit: (event: Event) => void
  onDelete: (event: Event) => void
  onStatusChange: (event: Event, status: EventStatus) => void
}) {
  const { spicyMode } = useAppStore()

  const isUpcoming = new Date(event.starts_at) > new Date()
  const isPast = event.status === 'completed' || new Date(event.starts_at) < new Date()
  const isCancelled = event.status === 'cancelled'

  const statusColor = isCancelled ? 'bg-muted' : isPast ? 'bg-green-500/10 text-green-600' : 'bg-blue-500/10 text-blue-600'

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">{event.title}</h3>
            <div className="flex items-center gap-2 mt-1">
              {event.type && (
                <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded">
                  {event.type}
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded ${statusColor}`}>
                {isCancelled ? 'Cancelled' : isPast ? 'Completed' : 'Upcoming'}
              </span>
              {event.is_spicy && spicyMode && <SpicyFlame enabled size="sm" />}
            </div>
          </div>
        </div>

        {event.location && <p className="text-sm text-muted-foreground">{event.location}</p>}

        <p className="text-sm text-muted-foreground">
          {formatDateTime(event.starts_at)}
          {event.ends_at && ` - ${formatDateTime(event.ends_at)}`}
        </p>

        {event.description && <p className="text-sm text-foreground line-clamp-2">{event.description}</p>}

        {/* Linked Contacts */}
        {event.contacts && event.contacts.length > 0 && (
          <div className="flex items-center gap-1">
            {event.contacts.slice(0, 3).map(contact => (
              <Avatar key={contact.id} contact={contact} size="sm" />
            ))}
            {event.contacts.length > 3 && (
              <span className="text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">
                +{event.contacts.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Post-event details */}
        {isPast && (
          <div className="space-y-2 pt-2 border-t border-border">
            {event.rating !== null && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Rating:</span>
                <StarRating value={event.rating} size="sm" readOnly />
              </div>
            )}
            {event.followup_notes && (
              <div className="text-xs text-foreground bg-secondary/50 rounded p-2">{event.followup_notes}</div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-border">
          {!isCancelled && (
            <>
              <Button variant="outline" size="sm" className="flex-1" onClick={() => onEdit(event)}>
                <PenLine className="h-3 w-3 mr-1" />
                Edit
              </Button>
              {!isPast && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => onStatusChange(event, 'completed')}
                >
                  <Check className="h-3 w-3 mr-1" />
                  Complete
                </Button>
              )}
            </>
          )}
          <Button
            variant="destructive"
            size="sm"
            className="flex-1"
            onClick={() => onDelete(event)}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Events() {
  const [newEventOpen, setNewEventOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [statusFilter, setStatusFilter] = useState<EventStatus | 'all'>('upcoming')

  const { data: eventsData = [] } = useEvents()
  const { data: contactsData } = useContacts()
  const createEvent = useCreateEvent()
  const updateEvent = useUpdateEvent()
  const deleteEvent = useDeleteEvent()

  const contacts = contactsData?.contacts || []
  const events = Array.isArray(eventsData) ? eventsData : eventsData.events || []

  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      if (statusFilter === 'all') return true

      const isPast = event.status === 'completed' || new Date(event.starts_at) < new Date()
      const isUpcoming = new Date(event.starts_at) > new Date()
      const isCancelled = event.status === 'cancelled'

      if (statusFilter === 'upcoming') return isUpcoming && !isCancelled
      if (statusFilter === 'past') return isPast || event.status === 'completed'
      if (statusFilter === 'cancelled') return isCancelled

      return true
    })
  }, [events, statusFilter])

  const handleCreateEvent = async (formData: any) => {
    await createEvent.mutateAsync(formData)
    setNewEventOpen(false)
  }

  const handleUpdateEvent = async (formData: any) => {
    if (editingEvent) {
      await updateEvent.mutateAsync({ id: editingEvent.id, data: formData })
      setEditingEvent(null)
    }
  }

  const handleDeleteEvent = async (event: Event) => {
    if (confirm('Are you sure you want to delete this event?')) {
      await deleteEvent.mutateAsync(event.id)
    }
  }

  const handleStatusChange = async (event: Event, newStatus: EventStatus) => {
    await updateEvent.mutateAsync({
      id: event.id,
      data: { status: newStatus },
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Events</h1>
          <p className="text-muted-foreground mt-1">Track your events and meetups</p>
        </div>
        <Dialog open={newEventOpen && !editingEvent} onOpenChange={setNewEventOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Event
            </Button>
          </DialogTrigger>
          <EventFormDialog
            open={newEventOpen && !editingEvent}
            onOpenChange={setNewEventOpen}
            onSubmit={handleCreateEvent}
            isLoading={createEvent.isPending}
            contacts={contacts}
          />
        </Dialog>
      </div>

      {/* Edit Event Dialog */}
      {editingEvent && (
        <EventFormDialog
          open={!!editingEvent}
          onOpenChange={(open) => !open && setEditingEvent(null)}
          onSubmit={handleUpdateEvent}
          isLoading={updateEvent.isPending}
          event={editingEvent}
          contacts={contacts}
        />
      )}

      {/* Tabs */}
      <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as EventStatus | 'all')}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Completed</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>

        {['all', 'upcoming', 'past', 'cancelled'].map(filter => (
          <TabsContent key={filter} value={filter} className="space-y-4">
            {filteredEvents.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <EmptyState
                  icon="calendar"
                  title="No events"
                  description={
                    statusFilter === 'all'
                      ? 'Create an event to get started'
                      : `No ${statusFilter} events`
                  }
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredEvents.map(event => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onEdit={(e) => setEditingEvent(e)}
                    onDelete={handleDeleteEvent}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
