import React from 'react'
import { Badge } from '@/components/ui/badge'
import type { Tag } from '@/types'

interface TagBadgeProps {
  tag: Tag
}

export function TagBadge({ tag }: TagBadgeProps) {
  const bgColor = tag.color || '#6b7280'

  return (
    <Badge
      style={{
        backgroundColor: bgColor,
        borderColor: bgColor,
        color: '#ffffff',
      }}
      className="text-xs"
    >
      {tag.name}
    </Badge>
  )
}
