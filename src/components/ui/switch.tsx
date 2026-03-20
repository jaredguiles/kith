import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, onCheckedChange, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(e.target.checked)
      onChange?.(e)
    }

    return (
      <label className="inline-flex items-center cursor-pointer">
        <input
          ref={ref}
          type="checkbox"
          className="hidden"
          onChange={handleChange}
          {...props}
        />
        <div
          className={cn(
            'w-11 h-6 rounded-full transition-colors',
            props.checked ? 'bg-neutral-400' : 'bg-neutral-700'
          )}
        >
          <div
            className={cn(
              'absolute w-5 h-5 rounded-full bg-white transition-transform mt-0.5 ml-0.5',
              props.checked ? 'translate-x-5' : 'translate-x-0'
            )}
          />
        </div>
      </label>
    )
  }
)
Switch.displayName = 'Switch'

export { Switch }
