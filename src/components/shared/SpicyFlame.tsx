import React from 'react'
import { Flame } from 'lucide-react'

interface SpicyFlameProps {
  enabled: boolean
  onChange?: (enabled: boolean) => void
  size?: 'sm' | 'md' | 'lg'
}

export function SpicyFlame({ enabled, onChange, size = 'md' }: SpicyFlameProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }

  const handleClick = () => {
    onChange?.(!enabled)
  }

  return (
    <button
      onClick={handleClick}
      className={`${sizeClasses[size]} transition-colors cursor-pointer ${
        enabled
          ? 'text-orange-500 fill-orange-500 hover:text-orange-600 hover:fill-orange-600'
          : 'text-neutral-400 hover:text-neutral-300'
      }`}
      title={enabled ? 'Spicy mode enabled' : 'Spicy mode disabled'}
    >
      <Flame className="w-full h-full" strokeWidth={enabled ? 0 : 2} />
    </button>
  )
}
