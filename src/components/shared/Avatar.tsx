import React from 'react'
import { Avatar as AvatarUI, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { getInitials, PRIDE_FLAGS } from '@/lib/utils'
import type { Contact } from '@/types'

interface AvatarProps {
  contact: Contact
  size?: 'sm' | 'md' | 'lg'
}

export function Avatar({ contact, size = 'md' }: AvatarProps) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-16 w-16',
  }

  const flagColors = contact.orientation ? PRIDE_FLAGS[contact.orientation] : null

  return (
    <div className="relative inline-block">
      <AvatarUI className={sizeClasses[size]}>
        {contact.photo_url && <AvatarImage src={contact.photo_url} alt={contact.display_name} />}
        <AvatarFallback>{getInitials(contact.display_name)}</AvatarFallback>
      </AvatarUI>

      {flagColors && (
        <div
          className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-neutral-950"
          style={{
            background: `conic-gradient(${flagColors.join(',')})`,
          }}
        />
      )}
    </div>
  )
}
