# Kith App - Complete Layout Shell Implementation

## Overview
A fully functional React 19 + TypeScript layout system for the Kith personal CRM app using shadcn/ui patterns, Tailwind CSS dark theme, and lucide-react icons.

## What Was Created

### 1. UI Component Library (19 components)
**Location:** `src/components/ui/`

Complete shadcn/ui-compatible component stubs built with HTML primitives and Tailwind CSS (no Radix UI dependencies):

- **button.tsx** - CVA-based button with 6 variants (default, secondary, destructive, ghost, outline, icon)
- **dialog.tsx** - Modal dialog with context API state management
- **sheet.tsx** - Slide-in drawer (supports top, right, bottom, left)
- **badge.tsx** - Variant-based badges (default, secondary, destructive, outline)
- **avatar.tsx** - Profile pictures with fallback initials
- **card.tsx** - Card layouts (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter)
- **input.tsx** - Text input with focus styles
- **label.tsx** - Form label styling
- **select.tsx** - Dropdown select with open/close state management
- **textarea.tsx** - Multi-line text input
- **switch.tsx** - Toggle switch component
- **tabs.tsx** - Tab navigation with active state
- **dropdown-menu.tsx** - Dropdown menu with trigger and items
- **tooltip.tsx** - Hoverable tooltip
- **progress.tsx** - Progress bar with percentage
- **separator.tsx** - Horizontal/vertical divider
- **scroll-area.tsx** - Scrollable container
- **command.tsx** - Command palette with groups and search
- **popover.tsx** - Floating popover component
- **index.ts** - Barrel exports for easy importing

### 2. Layout Components (4 new + 1 rewritten)
**Location:** `src/components/layout/`

#### Layout.tsx (Rewritten)
Root layout component with:
- Sidebar + main content area flex layout
- React Router Outlet for nested routes
- Auth user fetching on mount (`auth.me()`)
- Loading spinner during auth
- Mobile-responsive sidebar drawer
- Command palette integration
- Import widget integration

#### AppSidebar.tsx (New)
Full-featured dark sidebar featuring:
- Logo ("◆ Kith") with spicy mode indicator
- ⌘K search trigger button
- "+ New person" button for quick contact creation
- Navigation: Home, Contacts, Events, Groups, Notifications, Settings (admin-only)
- Collapsible groups section showing:
  - Group icon
  - Custom color indicator dot
  - Member count
- Bottom section with:
  - Current user display name
  - User role badge (main_admin/admin/user)
  - Logout button
- Collapsible state (narrows to icon-only on smaller screens)
- Mobile responsive with toggle button

#### MobileHeader.tsx (New)
Mobile-only header bar (≤768px):
- Hamburger menu toggle
- Centered "◆ Kith" logo
- User avatar on right

#### CommandPalette.tsx (New)
⌘K command palette with:
- Keyboard shortcut listener (Cmd+K / Ctrl+K)
- Quick Actions section:
  - New contact
  - Toggle spicy mode
  - Go to settings
- Contact Search section (fetches from API)
- Navigation section (all pages)
- Centered overlay dialog with backdrop

### 3. Shared Components (7 components)
**Location:** `src/components/shared/`

#### Avatar.tsx
Enhanced avatar component with:
- Contact photo display
- Initials fallback
- Pride flag overlay (circular gradient on bottom-right corner)
- Size variants (sm, md, lg)
- Uses PRIDE_FLAGS from utils

#### TagBadge.tsx
Colored tag display:
- Tag name
- Custom background color
- Uses Badge component

#### GroupBadge.tsx
Group display badge:
- Lucide-react icon
- Group name
- Member count badge
- Custom color support

#### StarRating.tsx
Interactive star rating:
- 1-5 stars (configurable max)
- Clickable when not readonly
- Yellow filled/outline states
- Size variants (sm, md, lg)

#### EmptyState.tsx
Empty state placeholder:
- Lucide icon
- Title and description
- Optional action button
- Centered layout

#### SpicyFlame.tsx
Spicy mode indicator:
- Filled orange when enabled
- Outline gray when disabled
- Uses Flame from lucide-react
- Size variants (sm, md, lg)
- Click handler for toggle

#### ImportWidget.tsx
Fixed bottom-right import progress widget:
- Shows active import jobs
- Displays platform and status
- Progress bar with record count
- New/merged/skipped counts
- "Review now" link when awaiting review
- Auto-polls API every 5 seconds
- Auto-dismisses when done

## Design System

### Color Palette
- Primary: neutral-950 (near black)
- Secondary: neutral-900/neutral-800
- Borders: neutral-700
- Text: neutral-50/neutral-200/neutral-400
- Accents: Orange (spicy), Yellow (ratings), Custom colors for groups/tags

### Responsive Breakpoints
- Mobile: < 768px (md:)
  - Sidebar hidden by default
  - Mobile header visible
  - Touch-friendly spacing
- Desktop: ≥ 768px
  - Sidebar visible by default
  - No mobile header

### Typography & Spacing
- All components use standard Tailwind sizing
- Consistent padding/margin scale
- Dark theme optimized contrast ratios

## Key Features

### State Management
- Uses Zustand (`useAppStore`) for:
  - Current user
  - Auth token
  - Spicy mode toggle
  - Sidebar open/closed state

### Authentication
- Fetches current user on Layout mount
- Shows loading spinner during auth
- Auto-redirects on 401 via API layer

### Search & Discovery
- ⌘K command palette
- Contact search in palette
- Quick navigation links

### Mobile Experience
- Collapsible sidebar drawer
- Mobile header with hamburger
- Touch-friendly button sizes
- Responsive grid layouts

### LGBTQ+ Features
- Pride flag overlays on avatars
- Support for orientation field
- Six pride flags: Gay, Lesbian, Bisexual, Pansexual, Transgender, Non-binary, Asexual, Queer

### Dark Theme
- Full dark mode with neutral grays
- High contrast text
- Smooth transitions
- Accessibility-compliant

## File Structure
```
src/components/
├── ui/ (19 components)
│   ├── avatar.tsx
│   ├── badge.tsx
│   ├── button.tsx
│   ├── card.tsx
│   ├── command.tsx
│   ├── dialog.tsx
│   ├── dropdown-menu.tsx
│   ├── input.tsx
│   ├── label.tsx
│   ├── popover.tsx
│   ├── progress.tsx
│   ├── scroll-area.tsx
│   ├── select.tsx
│   ├── separator.tsx
│   ├── sheet.tsx
│   ├── switch.tsx
│   ├── tabs.tsx
│   ├── textarea.tsx
│   ├── tooltip.tsx
│   └── index.ts
├── layout/ (5 components)
│   ├── Layout.tsx
│   ├── AppSidebar.tsx
│   ├── MobileHeader.tsx
│   ├── CommandPalette.tsx
│   └── index.ts
└── shared/ (7 components)
    ├── Avatar.tsx
    ├── TagBadge.tsx
    ├── GroupBadge.tsx
    ├── StarRating.tsx
    ├── EmptyState.tsx
    ├── SpicyFlame.tsx
    ├── ImportWidget.tsx
    └── index.ts
```

## Implementation Details

### UI Component Architecture
- All components use `forwardRef` for DOM element access
- `cn()` from @/lib/utils for class merging (clsx + tailwind-merge)
- CVA (class-variance-authority) for variant management
- React Context API for state management (Dialog, Sheet, Select, Dropdown, etc.)
- No external UI libraries - pure HTML + Tailwind

### Layout Features
- Outlet-based nested routing (React Router v6)
- Automatic user fetching on mount
- Loading state with spinner
- Mobile overlay when sidebar is open
- Command palette with keyboard integration
- Import job polling widget

### Shared Components
- Leverage UI component library
- Use lucide-react for icons
- Type-safe with full TypeScript support
- Compatible with data models from @/types

## Dependencies Used
- react (19.0.0)
- react-dom (19.0.0)
- react-router-dom (6.20.0)
- zustand (4.4.7)
- tailwindcss (3.3.6)
- lucide-react (0.292.0)
- class-variance-authority (0.7.0)
- clsx (2.0.0)
- tailwind-merge (2.2.0)

## Integration Points

### With App.tsx
- Layout is the root protected route wrapper
- Uses ProtectedRoute and AdminRoute guards
- Wraps all authenticated pages

### With API (@/lib/api)
- auth.me() for user loading
- contacts.list() for command palette
- groups.list() for sidebar groups
- importApi.jobs() for import widget

### With Store (@/store/appStore)
- currentUser state
- spicyMode toggle
- sidebarOpen state
- setCurrentUser, toggleSpicyMode, setSidebarOpen actions

### With Types (@/types)
- User type for currentUser
- Contact type for avatars and search
- Group type for sidebar groups
- ImportJob type for widget

## Usage Examples

### Using Button
```tsx
import { Button } from '@/components/ui'

<Button variant="default">Click me</Button>
<Button variant="ghost" size="sm">Small ghost button</Button>
```

### Using Dialog
```tsx
import { Dialog, DialogTrigger, DialogContent } from '@/components/ui'

<Dialog>
  <DialogTrigger>Open</DialogTrigger>
  <DialogContent>Content here</DialogContent>
</Dialog>
```

### Using Avatar with Pride Flag
```tsx
import { Avatar } from '@/components/shared'

<Avatar contact={contact} size="md" />
```

### Using Command Palette
The CommandPalette is automatically included in Layout, just press Cmd+K/Ctrl+K.

## Performance Considerations
- Sidebar groups limited to 5 items (pagination in full implementation)
- Import widget polls every 5 seconds (adjustable)
- Command palette lazy-loads contacts only when opened
- Mobile sidebar uses CSS transitions, not JavaScript animations
- All components use React.memo or useMemo where appropriate

## Accessibility
- Semantic HTML (button, input, nav, etc.)
- Focus-visible outlines on all interactive elements
- Disabled state styling
- ARIA labels where applicable
- High contrast dark theme
- Keyboard navigation support (Tab, Escape, etc.)

## Browser Support
- Modern browsers (Chrome, Firefox, Safari, Edge)
- CSS Grid and Flexbox support required
- No IE11 support (uses modern CSS)

## Future Enhancements
- Favorites section in sidebar (fetch from API)
- Recent contacts in command palette
- Customizable sidebar width
- Keyboard navigation for all menus
- Drag-and-drop in command palette
- Voice search in command palette
- Offline mode with service workers
