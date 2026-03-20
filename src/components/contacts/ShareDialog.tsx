import { useState } from 'react'
import { useUsers } from '@/hooks/useSettings'
import { contacts as contactsApi } from '@/lib/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Check, ChevronRight, Trash2 } from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'

interface ShareDialogProps {
  contactId: number
  open: boolean
  onClose: () => void
}

type Permission = 'read' | 'edit'
type Scope = 'basic' | 'full' | 'full_spicy'

export function ShareDialog({ contactId, open, onClose }: ShareDialogProps) {
  const { data: users = [] } = useUsers()
  const qc = useQueryClient()

  const shareMutation = useMutation({
    mutationFn: (data: any) => contactsApi.share(contactId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', contactId] })
      toast.success('Contact shared successfully')
      setSelectedUser(null)
      setPermission('read')
      setScope('basic')
    },
  })

  const unshareMutation = useMutation({
    mutationFn: (userId: number) => contactsApi.unshare(contactId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', contactId] })
      toast.success('Share removed')
    },
  })

  const [selectedUser, setSelectedUser] = useState<number | null>(null)
  const [permission, setPermission] = useState<Permission>('read')
  const [scope, setScope] = useState<Scope>('basic')
  const [openPopover, setOpenPopover] = useState(false)

  const handleShare = async () => {
    if (!selectedUser) {
      toast.error('Please select a user')
      return
    }

    await shareMutation.mutateAsync({
      user_id: selectedUser,
      permission,
      scope,
    })
  }

  const handleUnshare = (userId: number) => {
    if (confirm('Remove this user\'s access?')) {
      unshareMutation.mutate(userId)
    }
  }

  const selectedUserObj = users.find(u => u.id === selectedUser)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share Contact</DialogTitle>
          <DialogDescription>
            Share this contact with other users and control their access level
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* User Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Share With</Label>
            <Popover open={openPopover} onOpenChange={setOpenPopover}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  {selectedUserObj ? selectedUserObj.display_name : 'Select a user...'}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search users..." />
                  <CommandEmpty>No users found.</CommandEmpty>
                  <CommandList>
                    <CommandGroup>
                      {users.map(user => (
                        <CommandItem
                          key={user.id}
                          onSelect={() => {
                            setSelectedUser(user.id)
                            setOpenPopover(false)
                          }}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-xs font-medium text-white flex-shrink-0">
                              {getInitials(user.display_name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate">{user.display_name}</p>
                              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                            </div>
                            {user.id === selectedUser && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <Separator className="dark:bg-slate-800" />

          {/* Permission Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Permission Level</Label>
            <RadioGroup value={permission} onValueChange={value => setPermission(value as Permission)}>
              <div className="flex items-center space-x-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="read" id="read" />
                <Label htmlFor="read" className="flex-1 cursor-pointer">
                  <p className="text-sm font-medium">Read Only</p>
                  <p className="text-xs text-muted-foreground">Can view contact details</p>
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="edit" id="edit" />
                <Label htmlFor="edit" className="flex-1 cursor-pointer">
                  <p className="text-sm font-medium">Edit</p>
                  <p className="text-xs text-muted-foreground">Can view and modify contact</p>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <Separator className="dark:bg-slate-800" />

          {/* Scope Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">What to Share</Label>
            <RadioGroup value={scope} onValueChange={value => setScope(value as Scope)}>
              <div className="flex items-center space-x-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="basic" id="basic" />
                <Label htmlFor="basic" className="flex-1 cursor-pointer">
                  <p className="text-sm font-medium">Basic Info</p>
                  <p className="text-xs text-muted-foreground">Name, contact details, general notes</p>
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="full" id="full" />
                <Label htmlFor="full" className="flex-1 cursor-pointer">
                  <p className="text-sm font-medium">Full Info</p>
                  <p className="text-xs text-muted-foreground">All details except spicy content</p>
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="full_spicy" id="full_spicy" />
                <Label htmlFor="full_spicy" className="flex-1 cursor-pointer">
                  <p className="text-sm font-medium">Full + Spicy</p>
                  <p className="text-xs text-muted-foreground">Everything including spicy details</p>
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleShare}
            disabled={!selectedUser || shareMutation.isPending}
          >
            {shareMutation.isPending ? 'Sharing...' : 'Share Contact'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
