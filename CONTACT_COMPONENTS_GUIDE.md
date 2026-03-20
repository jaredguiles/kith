# Kith Contact Detail Components - Usage Guide

## Overview

Complete contact detail panel and related sub-components for Kith. Built with React 19, TypeScript, and Tailwind dark theme.

## Components

### ContactDetail.tsx
Main component that renders a contact profile panel. Opens as a Sheet (slide-in drawer) on desktop or full-page on mobile.

**Props:**
```typescript
interface ContactDetailProps {
  contactId: number
  open: boolean
  onClose: () => void
}
```

**Usage:**
```tsx
import { ContactDetail } from '@/components/contacts'

export function MyComponent() {
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  return (
    <ContactDetail
      contactId={selectedContactId || 0}
      open={isOpen && selectedContactId !== null}
      onClose={() => setIsOpen(false)}
    />
  )
}
```

**Features:**
- Responsive design (Sheet on desktop, modal on mobile)
- Avatar with pride flag overlay
- Star favorite toggle
- Spicy flame indicator (when spicy mode enabled)
- Action buttons: Edit, Merge, Share, Delete
- 7 tabs of information:
  - Info: Basic profile info with tag/group management
  - Contact: Emails, phones, addresses (CRUD operations)
  - Social: Social media links with platform icons
  - Timeline: Combined feed of events and notes
  - Media: Photo/video grid with preview and profile photo setting
  - Spicy: Spicy profile editor (only visible in spicy mode)
  - History: Changelog of all modifications

### ContactInfoTab.tsx
Displays all standard contact fields with inline tag and group management.

**Props:**
```typescript
interface ContactInfoTabProps {
  contact: Contact
}
```

**Features:**
- All contact fields in clean label-value layout
- Birthday calculation (age, zodiac sign)
- Rating display
- Tag management (add/remove with search)
- Group management (add/remove with search)
- Bio and notes display

### ContactDetailsTab.tsx
CRUD interface for contact emails, phones, and addresses.

**Props:**
```typescript
interface ContactDetailsTabProps {
  contactId: number
}
```

**Features:**
- Email list with label, value, and primary marking
- Phone list with label, value, and primary marking
- Address list with full address display
- Inline add/edit/delete for each type
- Dialog forms for adding/editing entries
- Primary entry indication with badges

### ContactSocialTab.tsx
Manage social media links with platform selection.

**Props:**
```typescript
interface ContactSocialTabProps {
  contactId: number
}
```

**Features:**
- Platform selection from PLATFORMS constant
- Username and URL fields
- Auto-generated URLs based on platform
- Platform-specific emoji icons
- External link button for each social link
- Add/edit/delete operations

### ContactTimelineTab.tsx
Chronological feed of timeline events and notes combined.

**Props:**
```typescript
interface ContactTimelineTabProps {
  contactId: number
}
```

**Features:**
- Add note form at the top
- Combined chronological feed (events + notes)
- Sort by date descending
- Inline note editing and deletion
- Spicy content filtering (when spicy mode off)
- Timeline event type icons
- Visual timeline with connectors

### ContactMediaTab.tsx
Photo and video grid with preview and profile photo setting.

**Props:**
```typescript
interface ContactMediaTabProps {
  contactId: number
}
```

**Features:**
- 3-column responsive grid
- Thumbnail display with hover effects
- Media preview modal (click to enlarge)
- Set as profile photo button (for eligible photos)
- Delete button with confirmation
- Spicy media filtering
- Upload button (placeholder for future implementation)

### ContactSpicyTab.tsx
Complete spicy profile editor (only visible in spicy mode).

**Props:**
```typescript
interface ContactSpicyTabProps {
  contactId: number
}
```

**Features:**
- Spicy type, orientation, role preference
- Positions input
- Kinks, turn-ons, turn-offs as tag arrays
- Boundaries and safe word fields
- Protection preference
- HIV status, PrEP tracking, testing dates
- STI notes
- Body type, body notes, endowment, grooming
- Spicy and chemistry ratings (star ratings)
- Would repeat toggle
- Last encounter date and encounter count
- Spicy notes field
- Save button to persist all changes

### ContactHistoryTab.tsx
Read-only changelog of all contact modifications.

**Props:**
```typescript
interface ContactHistoryTabProps {
  contactId: number
}
```

**Features:**
- Grouped by date
- Field name, old value → new value display
- Source tracking
- Timestamp for each change
- Sticky date headers
- Visual timeline with connectors

### ContactList.tsx
Reusable contact list component for displaying multiple contacts.

**Props:**
```typescript
interface ContactListProps {
  contacts: Contact[]
  onSelect: (contactId: number) => void
  onToggleFavorite: (contactId: number) => void
}
```

**Usage:**
```tsx
import { ContactList } from '@/components/contacts'

export function ContactsPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { data: contacts = [] } = useContacts()

  return (
    <ContactList
      contacts={contacts}
      onSelect={setSelectedId}
      onToggleFavorite={handleFavoriteToggle}
    />
  )
}
```

### ContactRow.tsx
Individual contact row with avatar, name, location, tags, and actions.

**Props:**
```typescript
interface ContactRowProps {
  contact: Contact
  onSelect: () => void
  onToggleFavorite: () => void
  spicyMode: boolean
}
```

**Features:**
- Avatar with pride flag overlay
- Display name with favorite star
- Location with icon
- Relationship type badge
- Tag badges (up to 2 with +N indicator)
- Rating display
- Spicy flame indicator (in spicy mode)
- Hover effects and responsive layout

### MergeDialog.tsx
Multi-step dialog for merging two contacts.

**Props:**
```typescript
interface MergeDialogProps {
  contactId: number
  open: boolean
  onClose: () => void
}
```

**Usage:**
```tsx
import { MergeDialog } from '@/components/contacts'

<MergeDialog
  contactId={contact.id}
  open={mergeOpen}
  onClose={() => setMergeOpen(false)}
/>
```

**Process:**
1. Step 1: Select the contact to merge with
2. Step 2: Compare fields side-by-side and choose values to keep
3. Step 3: Confirm merge

**Compared Fields:**
- display_name, first_name, last_name, nickname
- email, phone, birthday
- location, bio, occupation, company
- website

### ShareDialog.tsx
Dialog for sharing a contact with other users.

**Props:**
```typescript
interface ShareDialogProps {
  contactId: number
  open: boolean
  onClose: () => void
}
```

**Usage:**
```tsx
import { ShareDialog } from '@/components/contacts'

<ShareDialog
  contactId={contact.id}
  open={shareOpen}
  onClose={() => setShareOpen(false)}
/>
```

**Options:**
- User selection from users list
- Permission level: Read or Edit
- Scope: Basic, Full, or Full + Spicy

## Hooks Used

All components use React Query hooks from `@/hooks/`:
- `useContact(id)` - Fetch single contact
- `useContacts(params)` - Fetch contact list
- `useUpdateContact()` - Update contact
- `useDeleteContact()` - Delete contact
- `useToggleFavorite()` - Toggle favorite status
- `useMergeContacts()` - Merge two contacts
- `useTags()` - Fetch all tags
- `useGroups()` - Fetch all groups
- `useUsers()` - Fetch all users
- `useSettings()` - Fetch settings

## API Endpoints Used

From `@/lib/api`:
- `contacts.get(id)` - Get contact details
- `contacts.list(params)` - List contacts
- `contacts.update(id, data)` - Update contact
- `contacts.delete(id)` - Delete contact
- `contacts.merge(id, otherId, decisions)` - Merge contacts
- `contacts.share(id, data)` - Share contact
- `contacts.unshare(id, userId)` - Remove share
- `contacts.toggleFavorite(id)` - Toggle favorite
- `contacts.changelog(id)` - Get change history
- `contacts.setPhoto(id, mediaId)` - Set profile photo
- `contactDetails.*` - Email/phone/address CRUD
- `socials.*` - Social link CRUD
- `spicy.get(id)` - Get spicy profile
- `spicy.update(id, data)` - Update spicy profile
- `timeline.*` - Timeline event operations
- `notes.*` - Note CRUD operations
- `media.*` - Media management
- `tags.*` - Tag management
- `groups.*` - Group management
- `users.list()` - Get users for sharing

## Styling

All components use Tailwind CSS with dark theme support:
- `dark:bg-slate-950` for backgrounds
- `dark:border-slate-800` for borders
- `dark:bg-slate-900` for secondary backgrounds
- Proper text color hierarchy with `text-foreground` and `text-muted-foreground`

## Shared Components Used

- `Avatar` - Custom avatar with pride flag
- `StarRating` - Star rating display and input
- `SpicyFlame` - Spicy indicator icon
- `TagBadge` - Tag badge with color
- `GroupBadge` - Group badge with icon

## UI Components Used

- `Button` - Standard button
- `Input` - Text input
- `Textarea` - Multi-line text
- `Label` - Form labels
- `Badge` - Badge display
- `Dialog` - Modal dialogs
- `Sheet` - Side drawer (desktop)
- `Tabs` - Tab navigation
- `Select` - Dropdown select
- `Popover` - Popover menus
- `Command` - Command palette for search
- `RadioGroup` - Radio selection (newly added)
- `Separator` - Visual divider
- `ScrollArea` - Scrollable content
- `DropdownMenu` - Dropdown menus

## Features Highlights

### Responsive Design
- Desktop: Sheet drawer on right side
- Mobile: Full page overlay
- Automatic detection based on window.innerWidth

### Dark Theme
- Full dark mode support
- Slate color palette (950, 900, 800)
- Proper text contrast

### Form Handling
- React Hook Form style validation
- Real-time mutation feedback
- Toast notifications via Sonner
- Proper loading/disabled states

### Data Management
- React Query for caching and synchronization
- Automatic invalidation on mutations
- Optimistic UI updates

### Accessibility
- Proper labels for form inputs
- Keyboard navigation support
- ARIA attributes where needed
- Semantic HTML

## Error Handling

All mutations include proper error handling:
```tsx
const mutation = useMutation({
  mutationFn: ...,
  onSuccess: () => {
    qc.invalidateQueries(...)
    toast.success('Success message')
  },
  onError: (e: Error) => toast.error(e.message),
})
```

## Future Enhancements

- Media upload functionality
- Inline contact editing (Edit button)
- Advanced filtering and search
- Batch operations
- Contact duplication
- Custom field support

## Files Location

All components are in: `/sessions/keen-funny-albattani/mnt/knowledgecore/kith/src/components/contacts/`

Index file exports all components: `index.ts`
