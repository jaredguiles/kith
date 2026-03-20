import { useState, useMemo } from 'react'
import { useGroups, useCreateGroup, useUpdateGroup, useDeleteGroup, useAddGroupMember, useRemoveGroupMember } from '@/hooks/useGroups'
import { useContacts } from '@/hooks/useContacts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Avatar } from '@/components/shared/Avatar'
import { EmptyState } from '@/components/shared/EmptyState'
import { Group, Contact } from '@/types'
import * as LucideIcons from 'lucide-react'
import { Plus, Edit2, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react'

const ICON_OPTIONS = ['star', 'home', 'users', 'link', 'heart', 'zap', 'gift', 'coffee', 'book', 'music', 'camera', 'map']

const COLOR_SWATCHES = [
  '#ff6b6b',
  '#4ecdc4',
  '#45b7d1',
  '#96ceb4',
  '#ffeaa7',
  '#dfe6e9',
  '#a29bfe',
  '#fd79a8',
]

interface GroupFormProps {
  group?: Group | null
  onSubmit: (data: any) => void
  isLoading?: boolean
}

function GroupForm({ group, onSubmit, isLoading }: GroupFormProps) {
  const [name, setName] = useState(group?.name || '')
  const [icon, setIcon] = useState(group?.icon || 'users')
  const [color, setColor] = useState(group?.color || '#45b7d1')
  const [description, setDescription] = useState(group?.description || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ name, icon, color, description })
    setName('')
    setIcon('users')
    setColor('#45b7d1')
    setDescription('')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" required />
      </div>

      <div>
        <label className="text-sm font-medium">Icon</label>
        <Select value={icon} onValueChange={setIcon}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ICON_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                <span className="flex items-center gap-2">
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-medium">Color</label>
        <div className="flex gap-2 flex-wrap">
          {COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={`w-8 h-8 rounded border-2 ${color === swatch ? 'border-foreground' : 'border-transparent'}`}
              style={{ backgroundColor: swatch }}
              onClick={() => setColor(swatch)}
            />
          ))}
        </div>
        <Input
          type="text"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          placeholder="#45b7d1"
          className="mt-2"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Description</label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Group description" />
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {group ? 'Update Group' : 'Create Group'}
      </Button>
    </form>
  )
}

interface GroupCardProps {
  group: Group
  onEdit: (group: Group) => void
  onDelete: (group: Group) => void
}

function GroupCard({ group, onEdit, onDelete }: GroupCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [searchMember, setSearchMember] = useState('')
  const { data: contactsData } = useContacts()
  const contactsList = contactsData?.contacts || []
  const addMember = useAddGroupMember()
  const removeMember = useRemoveGroupMember()

  const members = group.members || []
  const displayMembers = members.slice(0, 5)

  const availableContacts = contactsList.filter(
    (c) => !members.some((m) => m.id === c.id) && c.display_name.toLowerCase().includes(searchMember.toLowerCase())
  )

  const handleAddMember = (contactId: number) => {
    addMember.mutate({ groupId: group.id, contactId })
    setSearchMember('')
  }

  const handleRemoveMember = (contactId: number) => {
    removeMember.mutate({ groupId: group.id, contactId })
  }

  const getIcon = (iconName: string) => {
    const iconKey = iconName.charAt(0).toUpperCase() + iconName.slice(1)
    const iconComponent = (LucideIcons as any)[iconKey]
    return iconComponent ? <iconComponent className="h-5 w-5" /> : <LucideIcons.Users className="h-5 w-5" />
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div
        className="h-2"
        style={{ backgroundColor: group.color || '#45b7d1' }}
      />

      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-3 flex-1">
            <div className="p-2 rounded-md bg-muted mt-1">
              {getIcon(group.icon || 'users')}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground">{group.name}</h3>
              {group.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{group.description}</p>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => onEdit(group)}
              className="p-1.5 hover:bg-muted rounded transition-colors"
              title="Edit group"
            >
              <Edit2 className="h-4 w-4 text-muted-foreground" />
            </button>
            {!group.is_system && (
              <button
                onClick={() => onDelete(group)}
                className="p-1.5 hover:bg-muted rounded transition-colors"
                title="Delete group"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </button>
            )}
          </div>
        </div>

        {/* Member count and avatars */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted-foreground">{members.length} member{members.length !== 1 ? 's' : ''}</p>
          {displayMembers.length > 0 && (
            <div className="flex -space-x-2">
              {displayMembers.map((member) => (
                <Avatar key={member.id} contact={member} size="sm" />
              ))}
              {members.length > 5 && (
                <div className="h-8 w-8 rounded-full bg-muted border border-border flex items-center justify-center text-xs">
                  +{members.length - 5}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Expand/Collapse button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-sm text-primary hover:bg-muted py-2 rounded transition-colors flex items-center justify-center gap-1"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {expanded ? 'Hide' : 'Show'} Members
        </button>

        {/* Expanded member list */}
        {expanded && (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            {members.map((member) => (
              <div key={member.id} className="flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Avatar contact={member} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{member.display_name}</p>
                    {member.location && <p className="text-xs text-muted-foreground truncate">{member.location}</p>}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveMember(member.id)}
                  className="p-1 hover:bg-destructive/10 rounded transition-colors"
                >
                  <X className="h-4 w-4 text-destructive" />
                </button>
              </div>
            ))}

            {/* Add member section */}
            <div className="border-t border-border pt-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Member
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Search contacts..."
                      value={searchMember}
                      onValueChange={setSearchMember}
                    />
                    {availableContacts.length === 0 ? (
                      <CommandEmpty>No contacts available</CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {availableContacts.map((contact) => (
                          <CommandItem
                            key={contact.id}
                            onSelect={() => handleAddMember(contact.id)}
                          >
                            <Avatar contact={contact} size="sm" />
                            <span className="ml-2">{contact.display_name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Groups() {
  const { data: groups = [], isLoading } = useGroups()
  const createGroup = useCreateGroup()
  const updateGroup = useUpdateGroup()
  const deleteGroup = useDeleteGroup()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [isDeleteConfirm, setIsDeleteConfirm] = useState<Group | null>(null)

  const handleCreate = (data: any) => {
    createGroup.mutate(data, {
      onSuccess: () => {
        setIsCreateDialogOpen(false)
      },
    })
  }

  const handleEdit = (data: any) => {
    if (editingGroup) {
      updateGroup.mutate(
        { id: editingGroup.id, data },
        {
          onSuccess: () => {
            setEditingGroup(null)
          },
        }
      )
    }
  }

  const handleDelete = (group: Group) => {
    deleteGroup.mutate(group.id)
    setIsDeleteConfirm(null)
  }

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading groups...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Groups</h1>
          <p className="text-muted-foreground mt-2">Organize contacts into groups</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Group
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Group</DialogTitle>
            </DialogHeader>
            <GroupForm onSubmit={handleCreate} isLoading={createGroup.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon="Users"
          title="No groups yet"
          description="Create a group to organize your contacts"
          action={
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Group
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              onEdit={() => setEditingGroup(group)}
              onDelete={() => setIsDeleteConfirm(group)}
            />
          ))}
        </div>
      )}

      {/* Edit Group Dialog */}
      <Dialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Group</DialogTitle>
          </DialogHeader>
          {editingGroup && (
            <GroupForm
              group={editingGroup}
              onSubmit={handleEdit}
              isLoading={updateGroup.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      {isDeleteConfirm && (
        <Dialog open={!!isDeleteConfirm} onOpenChange={(open) => !open && setIsDeleteConfirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Group?</DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground">
              Are you sure you want to delete "{isDeleteConfirm.name}"? This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDelete(isDeleteConfirm)}
                disabled={deleteGroup.isPending}
              >
                Delete
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
