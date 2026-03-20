import { useState, useMemo } from 'react'
import { Contact } from '@/types'
import { useContact, useUpdateContact, useDeleteContact, useToggleFavorite } from '@/hooks/useContacts'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar as AvatarUI, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, formatDate, getInitials, PRIDE_FLAGS } from '@/lib/utils'
import { Avatar } from '@/components/shared/Avatar'
import { StarRating } from '@/components/shared/StarRating'
import { SpicyFlame } from '@/components/shared/SpicyFlame'
import { TagBadge } from '@/components/shared/TagBadge'
import { GroupBadge } from '@/components/shared/GroupBadge'
import {
  Star,
  Edit,
  Trash2,
  Share2,
  MoreVertical,
  Mail,
  Phone,
  MapPin,
  Globe,
  Calendar,
  User,
  Zap,
  Lock,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ContactInfoTab } from './ContactInfoTab'
import { ContactDetailsTab } from './ContactDetailsTab'
import { ContactSocialTab } from './ContactSocialTab'
import { ContactTimelineTab } from './ContactTimelineTab'
import { ContactMediaTab } from './ContactMediaTab'
import { ContactSpicyTab } from './ContactSpicyTab'
import { ContactHistoryTab } from './ContactHistoryTab'
import { MergeDialog } from './MergeDialog'
import { ShareDialog } from './ShareDialog'

interface ContactDetailProps {
  contactId: number
  open: boolean
  onClose: () => void
}

export function ContactDetail({ contactId, open, onClose }: ContactDetailProps) {
  const { data: contact, isLoading } = useContact(contactId)
  const updateContact = useUpdateContact()
  const deleteContact = useDeleteContact()
  const toggleFavorite = useToggleFavorite()

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const spicyMode = localStorage.getItem('kith_spicy') === 'true'
  const isDesktop = window.innerWidth >= 768

  const handleDelete = async () => {
    if (contact?.id) {
      await deleteContact.mutateAsync(contact.id)
      setDeleteOpen(false)
      onClose()
    }
  }

  const handleToggleFavorite = () => {
    if (contact?.id) {
      toggleFavorite.mutate(contact.id)
    }
  }

  const handleClose = () => {
    onClose()
  }

  if (!contact || isLoading) {
    return null
  }

  const SheetComponent = isDesktop ? Sheet : 'div'
  const contentProps = isDesktop
    ? {
        open,
        onOpenChange: handleClose,
      }
    : {}

  const contentComponent = (
    <div className="flex flex-col h-full bg-background dark:bg-slate-950">
      {/* Header */}
      <div className="border-b border-border dark:border-slate-800 p-4 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="relative">
            <Avatar contact={contact} size="lg" />
            {spicyMode && contact.is_spicy && (
              <div className="absolute top-0 right-0">
                <SpicyFlame size="sm" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground truncate">{contact.display_name}</h1>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleToggleFavorite}
                className="flex-shrink-0"
              >
                <Star
                  className={cn('h-5 w-5', contact.is_favorite && 'fill-yellow-400 text-yellow-400')}
                />
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground flex-wrap">
              {contact.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  <span>{contact.location}</span>
                </div>
              )}
              {contact.relationship_type && (
                <Badge variant="secondary" className="text-xs">
                  {contact.relationship_type}
                </Badge>
              )}
            </div>
            {/* Tags */}
            {contact.tags && contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {contact.tags.slice(0, 3).map(tag => (
                  <TagBadge key={tag.id} tag={tag} />
                ))}
                {contact.tags.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{contact.tags.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mt-4">
          <Button variant="outline" size="sm" className="gap-2">
            <Edit className="h-4 w-4" />
            <span className="hidden sm:inline">Edit</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)} className="gap-2">
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">Share</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMergeOpen(true)} className="gap-2">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Merge</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <Tabs defaultValue="info" className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b border-border dark:border-slate-800 bg-transparent h-auto p-0">
            <TabsTrigger value="info" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              Info
            </TabsTrigger>
            <TabsTrigger value="contact" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              Contact
            </TabsTrigger>
            <TabsTrigger value="social" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              Social
            </TabsTrigger>
            <TabsTrigger value="timeline" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              Timeline
            </TabsTrigger>
            <TabsTrigger value="media" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              Media
            </TabsTrigger>
            {spicyMode && (
              <TabsTrigger value="spicy" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
                Spicy
              </TabsTrigger>
            )}
            <TabsTrigger value="history" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              History
            </TabsTrigger>
          </TabsList>

          <div className="p-4 sm:p-6">
            <TabsContent value="info" className="m-0">
              <ContactInfoTab contact={contact} />
            </TabsContent>
            <TabsContent value="contact" className="m-0">
              <ContactDetailsTab contactId={contact.id} />
            </TabsContent>
            <TabsContent value="social" className="m-0">
              <ContactSocialTab contactId={contact.id} />
            </TabsContent>
            <TabsContent value="timeline" className="m-0">
              <ContactTimelineTab contactId={contact.id} />
            </TabsContent>
            <TabsContent value="media" className="m-0">
              <ContactMediaTab contactId={contact.id} />
            </TabsContent>
            {spicyMode && (
              <TabsContent value="spicy" className="m-0">
                <ContactSpicyTab contactId={contact.id} />
              </TabsContent>
            )}
            <TabsContent value="history" className="m-0">
              <ContactHistoryTab contactId={contact.id} />
            </TabsContent>
          </div>
        </Tabs>
      </ScrollArea>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Contact</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {contact.display_name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteContact.isPending}>
              {deleteContact.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Dialog */}
      <MergeDialog
        contactId={contact.id}
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
      />

      {/* Share Dialog */}
      <ShareDialog
        contactId={contact.id}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </div>
  )

  if (isDesktop) {
    return (
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="right" className="w-full sm:w-[600px] md:w-[700px] p-0">
          {contentComponent}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div className={cn('fixed inset-0 z-50 bg-background dark:bg-slate-950', !open && 'hidden')}>
      {contentComponent}
      <div className="absolute top-4 right-4">
        <Button variant="ghost" size="icon" onClick={handleClose}>
          ×
        </Button>
      </div>
    </div>
  )
}
