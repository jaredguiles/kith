import { Contact } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/shared/Avatar'
import { SpicyFlame } from '@/components/shared/SpicyFlame'
import { TagBadge } from '@/components/shared/TagBadge'
import { Star, MapPin } from 'lucide-react'

interface ContactRowProps {
  contact: Contact
  onSelect: () => void
  onToggleFavorite: () => void
  spicyMode: boolean
}

export function ContactRow({ contact, onSelect, onToggleFavorite, spicyMode }: ContactRowProps) {
  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleFavorite()
  }

  return (
    <button
      onClick={onSelect}
      className="w-full text-left p-3 rounded-lg hover:bg-muted dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-border"
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <Avatar contact={contact} size="md" />
          {spicyMode && contact.is_spicy && (
            <div className="absolute top-0 right-0">
              <SpicyFlame size="xs" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-foreground truncate">{contact.display_name}</h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={handleFavoriteClick}
            >
              <Star
                className={cn(
                  'h-4 w-4 transition-colors',
                  contact.is_favorite && 'fill-yellow-400 text-yellow-400',
                )}
              />
            </Button>
          </div>

          {/* Location & Relationship */}
          <div className="flex items-center gap-2 mb-2 text-sm">
            {contact.location && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span className="text-xs truncate">{contact.location}</span>
              </div>
            )}
            {contact.relationship_type && (
              <Badge variant="secondary" className="text-xs h-5">
                {contact.relationship_type}
              </Badge>
            )}
          </div>

          {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {contact.tags.slice(0, 2).map(tag => (
                <TagBadge key={tag.id} tag={tag} />
              ))}
              {contact.tags.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{contact.tags.length - 2}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Right Section - Info Summary */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {contact.rating > 0 && (
            <div className="text-xs text-muted-foreground">
              {'⭐'.repeat(contact.rating)} {contact.rating > 0 && `(${contact.rating})`}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
