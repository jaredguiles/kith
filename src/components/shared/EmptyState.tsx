import React from 'react'
import { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <Icon className="w-12 h-12 text-neutral-500 mb-4" />
      <h3 className="text-lg font-semibold text-neutral-200 mb-2">{title}</h3>
      {description && <p className="text-sm text-neutral-400 mb-4 text-center max-w-md">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-neutral-100 rounded-md text-sm font-medium transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
