import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command'
import { useAppStore } from '@/store/appStore'
import { contacts } from '@/lib/api'
import type { Contact } from '@/types'
import { LayoutDashboard, Users, Calendar, FolderOpen, Settings, Flame } from 'lucide-react'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [contactList, setContactList] = useState<Contact[]>([])
  const navigate = useNavigate()
  const { toggleSpicyMode, spicyMode } = useAppStore()

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  useEffect(() => {
    if (!open) return

    const fetchContacts = async () => {
      try {
        const result = await contacts.list({ limit: '10' })
        setContactList(result.contacts)
      } catch (error) {
        console.error('Failed to fetch contacts:', error)
      }
    }

    fetchContacts()
  }, [open])

  const handleNavigation = (path: string) => {
    navigate(path)
    setOpen(false)
  }

  const handleToggleSpicy = () => {
    toggleSpicyMode()
    setOpen(false)
  }

  const handleNewContact = () => {
    navigate('/contacts?new=true')
    setOpen(false)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search contacts, pages, and actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={handleNewContact}>
            <span className="mr-2">➕</span>
            <span>New contact</span>
          </CommandItem>
          <CommandItem onSelect={handleToggleSpicy}>
            <Flame size={16} className="mr-2" />
            <span>Toggle spicy mode {spicyMode ? '(on)' : '(off)'}</span>
          </CommandItem>
          <CommandItem onSelect={() => handleNavigation('/settings')}>
            <Settings size={16} className="mr-2" />
            <span>Go to settings</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => handleNavigation('/')}>
            <LayoutDashboard size={16} className="mr-2" />
            <span>Dashboard</span>
          </CommandItem>
          <CommandItem onSelect={() => handleNavigation('/contacts')}>
            <Users size={16} className="mr-2" />
            <span>Contacts</span>
          </CommandItem>
          <CommandItem onSelect={() => handleNavigation('/events')}>
            <Calendar size={16} className="mr-2" />
            <span>Events</span>
          </CommandItem>
          <CommandItem onSelect={() => handleNavigation('/groups')}>
            <FolderOpen size={16} className="mr-2" />
            <span>Groups</span>
          </CommandItem>
          <CommandItem onSelect={() => handleNavigation('/notifications')}>
            <span className="mr-2">🔔</span>
            <span>Notifications</span>
          </CommandItem>
        </CommandGroup>

        {contactList.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recently Added Contacts">
              {contactList.map((contact) => (
                <CommandItem
                  key={contact.id}
                  onSelect={() => {
                    navigate(`/contacts/${contact.id}`)
                    setOpen(false)
                  }}
                >
                  <Users size={16} className="mr-2" />
                  <span>{contact.display_name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
