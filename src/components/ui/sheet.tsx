import * as React from 'react'
import { cn } from '@/lib/utils'

interface SheetContextType {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SheetContext = React.createContext<SheetContextType | undefined>(undefined)

function useSheet() {
  const context = React.useContext(SheetContext)
  if (!context) {
    throw new Error('Sheet components must be used within Sheet')
  }
  return context
}

interface SheetProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

const Sheet = React.forwardRef<HTMLDivElement, SheetProps>(({ open: controlledOpen, onOpenChange, children }, ref) => {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)

  const isOpen = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen
  const handleOpenChange = onOpenChange || setUncontrolledOpen

  return (
    <SheetContext.Provider value={{ open: isOpen, onOpenChange: handleOpenChange }}>
      <div ref={ref}>{children}</div>
    </SheetContext.Provider>
  )
})
Sheet.displayName = 'Sheet'

interface SheetTriggerProps extends React.HTMLAttributes<HTMLElement> {
  asChild?: boolean
}

const SheetTrigger = React.forwardRef<HTMLElement, SheetTriggerProps>(({ onClick, children }, ref) => {
  const { onOpenChange } = useSheet()

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    onOpenChange(true)
    onClick?.(e as any)
  }

  if (React.isValidElement(children)) {
    return React.cloneElement(children as any, { onClick: handleClick, ref })
  }

  return (
    <button ref={ref as any} onClick={handleClick}>
      {children}
    </button>
  )
})
SheetTrigger.displayName = 'SheetTrigger'

interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: 'top' | 'right' | 'bottom' | 'left'
}

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ className, side = 'left', children, ...props }, ref) => {
    const { open, onOpenChange } = useSheet()

    React.useEffect(() => {
      if (!open) return

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onOpenChange(false)
        }
      }

      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }, [open, onOpenChange])

    if (!open) return null

    const sideClasses = {
      top: 'top-0 left-0 right-0 h-auto animate-in slide-in-from-top',
      right: 'top-0 right-0 h-full w-3/4 max-w-sm animate-in slide-in-from-right',
      bottom: 'bottom-0 left-0 right-0 h-auto animate-in slide-in-from-bottom',
      left: 'top-0 left-0 h-full w-3/4 max-w-sm animate-in slide-in-from-left',
    }

    return (
      <>
        <div
          className="fixed inset-0 z-40 bg-black/50 animate-in fade-in-0"
          onClick={() => onOpenChange(false)}
        />
        <div
          ref={ref}
          className={cn(
            'fixed z-50 gap-4 bg-neutral-950 border border-neutral-700 p-6 shadow-lg transition ease-in-out duration-200',
            sideClasses[side],
            className
          )}
          {...props}
        >
          {children}
        </div>
      </>
    )
  }
)
SheetContent.displayName = 'SheetContent'

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-2', className)} {...props} />
)
SheetHeader.displayName = 'SheetHeader'

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-auto', className)} {...props} />
)
SheetFooter.displayName = 'SheetFooter'

const SheetTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2 ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
  )
)
SheetTitle.displayName = 'SheetTitle'

const SheetDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-neutral-400', className)} {...props} />
  )
)
SheetDescription.displayName = 'SheetDescription'

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription }
