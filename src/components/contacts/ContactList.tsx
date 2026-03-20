import { Contact } from '@/types'
import { ContactRow } from './ContactRow'

interface ContactListProps {
  contacts: Contact[]
  onSelect: (contactId: number) => void
  onToggleFavorite: (contactId: number) => void
}

export function ContactList({ contacts, onSelect, onToggleFavorite }: ContactListProps) {
  if (contacts.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">No contacts found</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {contacts.map(contact => (
        <ContactRow
          key={contact.id}
          contact={contact}
          onSelect={() => onSelect(contact.id)}
          onToggleFavorite={() => onToggleFavorite(contact.id)}
          spicyMode={localStorage.getItem('kith_spicy') === 'true'}
        />
      ))}
    </div>
  )
}
