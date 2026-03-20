import React from 'react'
import { Badge } from '@/components/ui/badge'
import type { Group } from '@/types'
import * as Icons from 'lucide-react'

interface GroupBadgeProps {
  group: Group
}

const iconMap: Record<string, any> = {
  users: Icons.Users,
  folder: Icons.FolderOpen,
  star: Icons.Star,
  heart: Icons.Heart,
  zap: Icons.Zap,
  flag: Icons.Flag,
  circle: Icons.Circle,
}

export function GroupBadge({ group }: GroupBadgeProps) {
  const bgColor = group.color || '#6b7280'
  const IconComponent = group.icon ? iconMap[group.icon] || Icons.FolderOpen : Icons.FolderOpen

  return (
    <Badge
      style={{
        backgroundColor: bgColor,
        borderColor: bgColor,
        color: '#ffffff',
      }}
      className="flex items-center gap-1 text-xs"
    >
      <IconComponent size={12} />
      {group.name}
      {group.member_count !== undefined && <span className="ml-1">({group.member_count})</span>}
    </Badge>
  )
}
