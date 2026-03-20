import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useContacts, useCreateContact, useDeleteContact, useToggleFavorite } from '@/hooks/useContacts'
import { useTags } from '@/hooks/useTags'
import { useGroups } from '@/hooks/useGroups'
import { useAppStore } from '@/store/appStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Avatar } from '@/components/shared/Avatar'
import { TagBadge } from '@/components/shared/TagBadge'
import { SpicyFlame } from '@/components/shared/SpicyFlame'
import { EmptyState } from '@/components/shared/EmptyState'
import { ContactForm } from '@/components/contacts/ContactForm'
import { formatDate } from '@/lib/utils'
import { Contact } from '@/types'
import { Search, Plus, Star, MoreVertical, Edit2, Trash2, Share2, Merge2 } from 'lucide-react'

type SortField = 'name' | 'created_at' | 'updated_at' | 'location'

interface ContactDetailProps {
  contact: Contact | null
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

function ContactDetail({ contact, isOpen, onOpenChange }: ContactDetailProps) {
  const { data: tags = [] } = useTags()
  const deleteContact = useDeleteContact()
  const toggleFav = useToggleFavorite()

  if (!contact) return null

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this contact?')) {
      await deleteContact.mutateAsync(contact.id)
      onOpenChange(false)
    }
  }

  const handleToggleFavorite = () => {
    toggleFav.mutate(contact.id)
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span>{contact.display_name}</span>
            <button
              onClick={handleToggleFavorite}
              className="text-yellow-500 hover:text-yellow-400 transition-colors"
            >
              <Star className={`h-5 w-5 ${contact.is_favorite ? 'fill-current' : ''}`} />
            </button>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Avatar and quick info */}
          <div className="flex items-center gap-4">
            <Avatar contact={contact} size="lg" />
            <div className="flex-1 space-y-1">
              <p className="text-lg font-semibold">{contact.display_name}</p>
              {contact.relationship_type && (
                <p className="text-sm text-muted-foreground">{contact.relationship_type}</p>
              )}
              {contact.location && (
                <p className="text-sm text-muted-foreground">{contact.location}</p>
              )}
            </div>
          </div>

          {/* Contact Info */}
          <div className="space-y-3 border-t border-border pt-4">
            <div className="text-sm">
              <p className="text-muted-foreground font-medium">Contact</p>
              {contact.email && <p className="text-foreground">{contact.email}</p>}
              {contact.phone && <p className="text-foreground">{contact.phone}</p>}
            </div>

            {contact.birthday && (
              <div className="text-sm">
                <p className="text-muted-foreground font-medium">Birthday</p>
                <p className="text-foreground">{formatDate(contact.birthday)}</p>
              </div>
            )}

            {contact.occupation && (
              <div className="text-sm">
                <p className="text-muted-foreground font-medium">Occupation</p>
                <p className="text-foreground">{contact.occupation}</p>
                {contact.company && <p className="text-foreground text-xs">{contact.company}</p>}
              </div>
            )}

            {contact.bio && (
              <div className="text-sm">
                <p className="text-muted-foreground font-medium">Bio</p>
                <p className="text-foreground">{contact.bio}</p>
              </div>
            )}

            {contact.how_we_met && (
              <div className="text-sm">
                <p className="text-muted-foreground font-medium">How We Met</p>
                <p className="text-foreground">{contact.how_we_met}</p>
              </div>
            )}
          </div>

          {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
            <div className="border-t border-border pt-4 space-y-2">
              <p className="text-sm text-muted-foreground font-medium">Tags</p>
              <div className="flex flex-wrap gap-2">
                {contact.tags.map(tag => (
                  <TagBadge key={tag.id} tag={tag} />
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {contact.notes_text && (
            <div className="border-t border-border pt-4 space-y-2">
              <p className="text-sm text-muted-foreground font-medium">Notes</p>
              <p className="text-sm text-foreground">{contact.notes_text}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="border-t border-border pt-4 space-y-1 text-xs text-muted-foreground">
            <p>Added {formatDate(contact.created_at)}</p>
            <p>Updated {formatDate(contact.updated_at)}</p>
          </div>

          {/* Actions */}
          <div className="border-t border-border pt-4 flex gap-2">
            <Button variant="outline" size="sm" className="flex-1">
              <Edit2 className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1"
              onClick={handleDelete}
              disabled={deleteContact.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ContactRow({ contact, onSelect }: { contact: Contact; onSelect: () => void }) {
  const { spicyMode } = useAppStore()
  const toggleFav = useToggleFavorite()
  const deleteContact = useDeleteContact()

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleFav.mutate(contact.id)
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('Delete this contact?')) {
      await deleteContact.mutateAsync(contact.id)
    }
  }

  return (
    <div
      onClick={onSelect}
      className="flex items-center gap-4 p-4 border-b border-border hover:bg-accent cursor-pointer transition-colors"
    >
      <Avatar contact={contact} size="sm" />

      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{contact.display_name}</p>
        {contact.location && <p className="text-xs text-muted-foreground truncate">{contact.location}</p>}
      </div>

      {contact.relationship_type && (
        <span className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded">
          {contact.relationship_type}
        </span>
      )}

      {contact.tags && contact.tags.length > 0 && (
        <div className="flex gap-1 flex-wrap max-w-[200px]">
          {contact.tags.slice(0, 2).map(tag => (
            <TagBadge key={tag.id} tag={tag} />
          ))}
          {contact.tags.length > 2 && (
            <span className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded">
              +{contact.tags.length - 2}
            </span>
          )}
        </div>
      )}

      <button
        onClick={handleToggleFavorite}
        className="text-yellow-500 hover:text-yellow-400 transition-colors"
      >
        <Star className={`h-4 w-4 ${contact.is_favorite ? 'fill-current' : ''}`} />
      </button>

      {contact.is_spicy && spicyMode && (
        <SpicyFlame enabled={true} size="sm" />
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>
            <Edit2 className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Merge2 className="h-4 w-4 mr-2" />
            Merge
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default function Contacts() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [newContactOpen, setNewContactOpen] = useState(false)
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [sortField, setSortField] = useState<SortField>('name')
  const [filterTag, setFilterTag] = useState<string>('')
  const [favoriteOnly, setFavoriteOnly] = useState(false)

  const search = searchParams.get('q') || ''
  const params: Record<string, string> = {}
  if (search) params.search = search
  if (filterTag) params.tag = filterTag

  const { data: contactsData, isLoading } = useContacts(params)
  const { data: tagsData = [] } = useTags()
  const { data: groupsData = [] } = useGroups()
  const createContact = useCreateContact()

  const contacts = contactsData?.contacts || []

  const filteredAndSorted = useMemo(() => {
    let result = [...contacts]

    if (favoriteOnly) {
      result = result.filter(c => c.is_favorite)
    }

    result.sort((a, b) => {
      if (sortField === 'name') {
        return a.display_name.localeCompare(b.display_name)
      } else if (sortField === 'created_at') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      } else if (sortField === 'updated_at') {
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      } else if (sortField === 'location') {
        return (a.location || '').localeCompare(b.location || '')
      }
      return 0
    })

    return result
  }, [contacts, sortField, favoriteOnly])

  const selectedContact = contacts.find(c => c.id === selectedContactId) || null

  const handleNewContact = async (formData: any) => {
    await createContact.mutateAsync(formData)
    setNewContactOpen(false)
  }

  const handleSearchChange = (value: string) => {
    if (value) {
      setSearchParams({ q: value })
    } else {
      setSearchParams({})
    }
  }

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Contacts</h1>
          <p className="text-muted-foreground mt-1">Manage your contact list</p>
        </div>
        <Dialog open={newContactOpen} onOpenChange={setNewContactOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Contact
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Contact</DialogTitle>
            </DialogHeader>
            <ContactForm
              tags={tagsData}
              onSubmit={handleNewContact}
              isLoading={createContact.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Toolbar */}
      <div className="space-y-3 bg-card rounded-lg border border-border p-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filters and Sort */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter by tag */}
          {tagsData.length > 0 && (
            <Select value={filterTag} onValueChange={setFilterTag}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All tags</SelectItem>
                {tagsData.map(tag => (
                  <SelectItem key={tag.id} value={String(tag.id)}>
                    {tag.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Favorites toggle */}
          <Button
            variant={favoriteOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFavoriteOnly(!favoriteOnly)}
            className="gap-1"
          >
            <Star className="h-4 w-4" />
            Favorites
          </Button>

          {/* Sort */}
          <Select value={sortField} onValueChange={(value) => setSortField(value as SortField)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="created_at">Added</SelectItem>
              <SelectItem value="updated_at">Updated</SelectItem>
              <SelectItem value="location">Location</SelectItem>
            </SelectContent>
          </Select>

          <div className="text-sm text-muted-foreground ml-auto">
            {filteredAndSorted.length} contact{filteredAndSorted.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Contact List and Detail Panel */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* List */}
        <div className="flex-1 bg-card rounded-lg border border-border overflow-hidden flex flex-col">
          {filteredAndSorted.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon="users"
                title="No contacts found"
                description={search ? 'Try a different search' : 'Add a contact to get started'}
              />
            </div>
          ) : (
            <div className="overflow-y-auto flex-1">
              {filteredAndSorted.map(contact => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  onSelect={() => {
                    setSelectedContactId(contact.id)
                    setDetailPanelOpen(true)
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      <ContactDetail
        contact={selectedContact}
        isOpen={detailPanelOpen}
        onOpenChange={setDetailPanelOpen}
      />
    </div>
  )
}
