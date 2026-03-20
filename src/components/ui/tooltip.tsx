import * as React from 'react'
import { cn } from '@/lib/utils'

interface TooltipContextType {
  open: boolean
  setOpen: (open: boolean) => void
}

const TooltipContext = React.createContext<TooltipContextType | undefined>(undefined)

function useTooltip() {
  const context = React.useContext(TooltipContext)
  if (!context) {
    throw new Error('Tooltip components must be used within TooltipProvider')
  }
  return context
}

interface TooltipProviderProps {
  children: React.ReactNode
}

const TooltipProvider = React.forwardRef<HTMLDivElement, TooltipProviderProps>(({ children }, ref) => {
  const [open, setOpen] = React.useState(false)

  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      <div ref={ref}>{children}</div>
    </TooltipContext.Provider>
  )
})
TooltipProvider.displayName = 'TooltipProvider'

interface TooltipProps {
  children: React.ReactNode
  delayDuration?: number
}

const Tooltip = React.forwardRef<HTMLDivElement, TooltipProps>(({ children }, ref) => (
  <div ref={ref} className="inline-block relative">
    {children}
  </div>
))
Tooltip.displayName = 'Tooltip'

const TooltipTrigger = React.forwardRef<HTMLButtonElement, React.HTMLAttributes<HTMLButtonElement>>(
  ({ onMouseEnter, onMouseLeave, children, ...props }, ref) => {
    const { setOpen } = useTooltip()

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      setOpen(true)
      onMouseEnter?.(e)
    }

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      setOpen(false)
      onMouseLeave?.(e)
    }

    return (
      <button ref={ref} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} {...props}>
        {children}
      </button>
    )
  }
)
TooltipTrigger.displayName = 'TooltipTrigger'

const TooltipContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const { open } = useTooltip()

    if (!open) return null

    return (
      <div
        ref={ref}
        className={cn(
          'absolute z-50 rounded-md bg-neutral-800 px-3 py-1.5 text-xs text-neutral-50 shadow-md bottom-full left-1/2 -translate-x-1/2 -translate-y-2 whitespace-nowrap',
          className
        )}
        {...props}
      />
    )
  }
)
TooltipContent.displayName = 'TooltipContent'

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
