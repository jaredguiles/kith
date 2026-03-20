import React from 'react'
import { Star } from 'lucide-react'

interface StarRatingProps {
  value: number
  onChange?: (value: number) => void
  readonly?: boolean
  size?: 'sm' | 'md' | 'lg'
  max?: number
}

export function StarRating({ value, onChange, readonly = false, size = 'md', max = 5 }: StarRatingProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }

  const handleClick = (rating: number) => {
    if (!readonly && onChange) {
      onChange(rating)
    }
  }

  return (
    <div className="flex gap-1">
      {Array.from({ length: max }).map((_, i) => {
        const rating = i + 1
        const isFilled = rating <= Math.round(value)

        return (
          <button
            key={i}
            onClick={() => handleClick(rating)}
            disabled={readonly}
            className={`${sizeClasses[size]} transition-colors ${
              isFilled
                ? 'text-yellow-400 fill-yellow-400 hover:text-yellow-500 hover:fill-yellow-500'
                : 'text-neutral-400 hover:text-neutral-300'
            } ${readonly ? 'cursor-default' : 'cursor-pointer'} disabled:opacity-75`}
          >
            <Star className="w-full h-full" />
          </button>
        )
      })}
    </div>
  )
}
