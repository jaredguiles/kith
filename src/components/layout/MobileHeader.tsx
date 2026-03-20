import React from 'react'
import { Menu } from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/appStore'
import { getInitials } from '@/lib/utils'

interface MobileHeaderProps {
  onMenuClick: () => void
}

export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  const { currentUser } = useAppStore()

  return (
    <div className="md:hidden flex items-center justify-between h-16 border-b border-neutral-700 bg-neutral-950 px-4">
      <Button
        variant="ghost"
        size="icon"
        onClick={onMenuClick}
        className="text-neutral-400 hover:text-neutral-200"
      >
        <Menu size={24} />
      </Button>

      <div className="text-center">
        <h1 className="text-lg font-semibold text-neutral-50">◆ Kith</h1>
      </div>

      <Avatar className="h-8 w-8">
        <AvatarFallback>{currentUser ? getInitials(currentUser.display_name) : 'U'}</AvatarFallback>
      </Avatar>
    </div>
  )
}
