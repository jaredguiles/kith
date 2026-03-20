import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { timeline, notes } from '@/lib/api'
import { TimelineEvent, Note } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Plus, Trash2, Edit2, Calendar, FileText } from 'lucide-react'
import { formatDate, formatDateTime } from '@/lib/utils'
import { SpicyFlame } from '@/components/shared/SpicyFlame'

interface ContactTimelineTabProps {
  contactId: number
}

export function ContactTimelineTab({ contactId }: ContactTimelineTabProps) {
  const qc = useQueryClient()
  const spicyMode = localStorage.getItem('kith_spicy') === 'true'

  const { data: timelineEvents = [] } = useQuery({
    queryKey: ['contact-timeline', contactId],
    queryFn: () => timeline.list(contactId),
  })

  const { data: notesList = [] } = useQuery({
    queryKey: ['contact-notes', contactId],
    queryFn: () => notes.list(contactId),
  })

  const createNoteMutation = useMutation({
    mutationFn: (data: any) => notes.create({ ...data, contact_id: contactId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-notes', contactId] })
      setNewNoteContent('')
      toast.success('Note added')
    },
  })

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => notes.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-notes', contactId] })
      setEditingNoteId(null)
      setEditingNoteContent('')
      toast.success('Note updated')
    },
  })

  const deleteNoteMutation = useMutation({
    mutationFn: (id: number) => notes.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-notes', contactId] })
      toast.success('Note deleted')
    },
  })

  const [newNoteContent, setNewNoteContent] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null)
  const [editingNoteContent, setEditingNoteContent] = useState('')

  // Combine timeline events and notes, sorted by date
  const combinedItems = useMemo(() => {
    const items: Array<
      | { type: 'timeline'; data: TimelineEvent }
      | { type: 'note'; data: Note }
    > = [
      ...timelineEvents.map(e => ({ type: 'timeline' as const, data: e })),
      ...notesList.map(n => ({ type: 'note' as const, data: n })),
    ]

    return items.sort((a, b) => {
      const dateA = new Date(a.type === 'timeline' ? a.data.occurred_at : a.data.created_at).getTime()
      const dateB = new Date(b.type === 'timeline' ? b.data.occurred_at : b.data.created_at).getTime()
      return dateB - dateA
    })
  }, [timelineEvents, notesList])

  // Filter spicy items if spicy mode is off
  const filteredItems = combinedItems.filter(item => {
    if (spicyMode) return true
    return item.type === 'timeline' ? !item.data.is_spicy : !item.data.is_spicy
  })

  const handleAddNote = async () => {
    if (!newNoteContent.trim()) {
      toast.error('Note cannot be empty')
      return
    }
    await createNoteMutation.mutateAsync({
      content: newNoteContent,
      is_spicy: false,
    })
  }

  const handleEditNote = (note: Note) => {
    setEditingNoteId(note.id)
    setEditingNoteContent(note.content)
  }

  const handleUpdateNote = async () => {
    if (!editingNoteContent.trim() || !editingNoteId) return
    await updateNoteMutation.mutateAsync({
      id: editingNoteId,
      data: { content: editingNoteContent },
    })
  }

  const handleDeleteNote = async (id: number) => {
    if (confirm('Delete this note?')) {
      await deleteNoteMutation.mutateAsync(id)
    }
  }

  return (
    <div className="space-y-6">
      {/* Add Note Form */}
      <div className="space-y-3 p-4 rounded-lg bg-muted dark:bg-slate-900">
        <Label className="text-xs font-semibold">Add Note</Label>
        <Textarea
          value={newNoteContent}
          onChange={e => setNewNoteContent(e.target.value)}
          placeholder="What's new with this contact?"
          className="resize-none"
          rows={3}
        />
        <Button
          onClick={handleAddNote}
          disabled={createNoteMutation.isPending || !newNoteContent.trim()}
          className="w-full"
        >
          Add Note
        </Button>
      </div>

      <Separator className="dark:bg-slate-800" />

      {/* Timeline Feed */}
      <div className="space-y-4">
        {filteredItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No timeline events or notes</p>
        ) : (
          filteredItems.map((item, idx) => {
            if (item.type === 'timeline') {
              const event = item.data
              return (
                <div key={`timeline-${event.id}`} className="flex gap-4">
                  <div className="relative flex flex-col items-center">
                    <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-white text-xs flex-shrink-0">
                      <Calendar className="h-4 w-4" />
                    </div>
                    {idx < filteredItems.length - 1 && (
                      <div className="w-0.5 h-12 bg-border dark:bg-slate-800 mt-2" />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{event.title}</p>
                      {event.is_spicy && <SpicyFlame size="xs" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDate(event.occurred_at)}</p>
                    {event.description && (
                      <p className="text-sm text-foreground mt-2">{event.description}</p>
                    )}
                  </div>
                </div>
              )
            } else {
              const note = item.data
              return (
                <div key={`note-${note.id}`} className="flex gap-4">
                  <div className="relative flex flex-col items-center">
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground text-xs flex-shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    {idx < filteredItems.length - 1 && (
                      <div className="w-0.5 h-12 bg-border dark:bg-slate-800 mt-2" />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    {editingNoteId === note.id ? (
                      <div className="space-y-3">
                        <Textarea
                          value={editingNoteContent}
                          onChange={e => setEditingNoteContent(e.target.value)}
                          className="resize-none"
                          rows={3}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={handleUpdateNote}
                            disabled={updateNoteMutation.isPending}
                          >
                            Save
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingNoteId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">{formatDateTime(note.created_at)}</p>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditNote(note)}
                              className="h-6 w-6"
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteNote(note.id)}
                              className="h-6 w-6 hover:bg-destructive/20"
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">{note.content}</p>
                      </>
                    )}
                  </div>
                </div>
              )
            }
          })
        )}
      </div>
    </div>
  )
}
