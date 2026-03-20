import * as React from 'react'
import { cn } from '@/lib/utils'

interface SelectContextType {
  value: string | number
  onChange: (value: string | number) => void
  open: boolean
  setOpen: (open: boolean) => void
}

const SelectContext = React.createContext<SelectContextType | undefined>(undefined)

function useSelect() {
  const context = React.useContext(SelectContext)
  if (!context) {
    throw new Error('Select components must be used within Select')
  }
  return context
}

interface SelectProps {
  value?: string | number
  onValueChange?: (value: string | number) => void
  children: React.ReactNode
}

const Select = React.forwardRef<HTMLDivElement, SelectProps>(({ value = '', onValueChange, children }, ref) => {
  const [internalValue, setInternalValue] = React.useState(value)
  const [open, setOpen] = React.useState(false)

  const currentValue = value !== undefined ? value : internalValue
  const handleChange = onValueChange || setInternalValue

  return (
    <SelectContext.Provider value={{ value: currentValue, onChange: handleChange, open, setOpen }}>
      <div ref={ref}>{children}</div>
    </SelectContext.Provider>
  )
})
Select.displayName = 'Select'

const SelectTrigger = React.forwardRef<HTMLButtonElement, React.HTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => {
    const { open, setOpen } = useSelect()

    return (
      <button
        ref={ref}
        onClick={() => setOpen(!open)}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-50 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 focus:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
    )
  }
)
SelectTrigger.displayName = 'SelectTrigger'

const SelectValue = React.forwardRef<HTMLSpanElement, { placeholder?: string }>(({ placeholder }, ref) => {
  const { value } = useSelect()

  return (
    <span ref={ref} className="truncate">
      {value || placeholder || 'Select...'}
    </span>
  )
})
SelectValue.displayName = 'SelectValue'

const SelectContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const { open, setOpen } = useSelect()

    React.useEffect(() => {
      if (!open) return

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setOpen(false)
        }
      }

      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Node
        if (ref && 'current' in ref && ref.current && !ref.current.contains(target)) {
          setOpen(false)
        }
      }

      document.addEventListener('keydown', handleEscape)
      document.addEventListener('click', handleClickOutside)
      return () => {
        document.removeEventListener('keydown', handleEscape)
        document.removeEventListener('click', handleClickOutside)
      }
    }, [open, setOpen])

    if (!open) return null

    return (
      <div
        ref={ref}
        className={cn(
          'relative z-50 min-w-32 overflow-hidden rounded-md border border-neutral-700 bg-neutral-950 shadow-md',
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
SelectContent.displayName = 'SelectContent'

const SelectItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { value: string | number }>(
  ({ value, className, onClick, children, ...props }, ref) => {
    const { value: selectedValue, onChange, setOpen } = useSelect()
    const isSelected = selectedValue === value

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      onChange(value)
      setOpen(false)
      onClick?.(e)
    }

    return (
      <div
        ref={ref}
        onClick={handleClick}
        className={cn(
          'cursor-pointer px-3 py-2 text-sm hover:bg-neutral-800 flex items-center gap-2',
          isSelected && 'bg-neutral-800 text-neutral-50',
          className
        )}
        {...props}
      >
        {isSelected && <span className="text-xs font-semibold">✓</span>}
        {children}
      </div>
    )
  }
)
SelectItem.displayName = 'SelectItem'

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
