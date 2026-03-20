import * as React from 'react'
import { cn } from '@/lib/utils'

interface CommandContextType {
  search: string
  setSearch: (search: string) => void
}

const CommandContext = React.createContext<CommandContextType | undefined>(undefined)

function useCommand() {
  const context = React.useContext(CommandContext)
  if (!context) {
    throw new Error('Command components must be used within Command')
  }
  return context
}

interface CommandProps {
  children: React.ReactNode
}

const Command = React.forwardRef<HTMLDivElement, CommandProps>(({ children }, ref) => {
  const [search, setSearch] = React.useState('')

  return (
    <CommandContext.Provider value={{ search, setSearch }}>
      <div ref={ref} className="overflow-hidden rounded-md border border-neutral-700 bg-neutral-950 shadow-md">
        {children}
      </div>
    </CommandContext.Provider>
  )
})
Command.displayName = 'Command'

interface CommandDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

const CommandDialog = React.forwardRef<HTMLDivElement, CommandDialogProps>(
  ({ open, onOpenChange, children }, ref) => {
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

    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => onOpenChange(false)} />
        <div
          ref={ref}
          className="fixed left-1/2 top-1/4 z-50 w-full max-w-lg -translate-x-1/2 rounded-lg border border-neutral-700 bg-neutral-950 shadow-xl"
        >
          {children}
        </div>
      </>
    )
  }
)
CommandDialog.displayName = 'CommandDialog'

const CommandInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    const { setSearch } = useCommand()

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value)
      props.onChange?.(e)
    }

    return (
      <input
        ref={ref}
        className={cn(
          'flex h-11 w-full rounded-md bg-transparent px-4 py-3 text-sm outline-none placeholder:text-neutral-500 border-b border-neutral-700',
          className
        )}
        placeholder="Search..."
        {...props}
        onChange={handleChange}
      />
    )
  }
)
CommandInput.displayName = 'CommandInput'

const CommandList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('max-h-64 overflow-y-auto overflow-x-hidden', className)}
      {...props}
    />
  )
)
CommandList.displayName = 'CommandList'

const CommandEmpty = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('py-6 text-center text-sm text-neutral-400', className)}
      {...props}
    />
  )
)
CommandEmpty.displayName = 'CommandEmpty'

const CommandGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('overflow-hidden p-1', className)} {...props} />
  )
)
CommandGroup.displayName = 'CommandGroup'

const CommandItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { onSelect?: () => void }>(
  ({ className, onSelect, ...props }, ref) => (
    <div
      ref={ref}
      onClick={onSelect}
      className={cn(
        'cursor-pointer relative flex select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-neutral-800 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
    />
  )
)
CommandItem.displayName = 'CommandItem'

const CommandSeparator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('-mx-1 h-px bg-neutral-700', className)} {...props} />
  )
)
CommandSeparator.displayName = 'CommandSeparator'

export { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator }
