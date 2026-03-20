import { useState } from 'react'
import { useContacts, useMergeContacts } from '@/hooks/useContacts'
import { Contact } from '@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { cn, getInitials } from '@/lib/utils'
import { Check, ChevronRight } from 'lucide-react'

interface MergeDialogProps {
  contactId: number
  open: boolean
  onClose: () => void
}

type Step = 'select' | 'review' | 'confirm'

export function MergeDialog({ contactId, open, onClose }: MergeDialogProps) {
  const { data: allContacts = [] } = useContacts()
  const mergeMutation = useMergeContacts()

  const [step, setStep] = useState<Step>('select')
  const [otherContactId, setOtherContactId] = useState<number | null>(null)
  const [decisions, setDecisions] = useState<Record<string, 'keep' | 'merge'>>({})
  const [openPopover, setOpenPopover] = useState(false)

  const currentContact = allContacts.find(c => c.id === contactId)
  const otherContact = otherContactId ? allContacts.find(c => c.id === otherContactId) : null

  const handleSelectContact = (contact: Contact) => {
    setOtherContactId(contact.id)
    setOpenPopover(false)
    setStep('review')
  }

  const handleConfirmMerge = async () => {
    if (!otherContact) return
    await mergeMutation.mutateAsync({
      id: contactId,
      otherId: otherContact.id,
      decisions,
    })
    onClose()
  }

  const handleDecision = (field: string, decision: 'keep' | 'merge') => {
    setDecisions(prev => ({ ...prev, [field]: decision }))
  }

  const fieldsToCompare = [
    { key: 'display_name', label: 'Display Name' },
    { key: 'first_name', label: 'First Name' },
    { key: 'last_name', label: 'Last Name' },
    { key: 'nickname', label: 'Nickname' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'birthday', label: 'Birthday' },
    { key: 'location', label: 'Location' },
    { key: 'bio', label: 'Bio' },
    { key: 'occupation', label: 'Occupation' },
    { key: 'company', label: 'Company' },
    { key: 'website', label: 'Website' },
  ]

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge Contacts</DialogTitle>
          <DialogDescription>
            Merge {currentContact?.display_name || 'this contact'} with another contact
          </DialogDescription>
        </DialogHeader>

        {step === 'select' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Select the contact to merge with:</p>
            <Popover open={openPopover} onOpenChange={setOpenPopover}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  {otherContact ? otherContact.display_name : 'Choose a contact...'}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search contacts..." />
                  <CommandEmpty>No contacts found.</CommandEmpty>
                  <CommandList>
                    <CommandGroup>
                      {allContacts
                        .filter(c => c.id !== contactId)
                        .map(contact => (
                          <CommandItem
                            key={contact.id}
                            onSelect={() => handleSelectContact(contact)}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-xs font-medium text-white flex-shrink-0">
                                {getInitials(contact.display_name)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm truncate">{contact.display_name}</p>
                                <p className="text-xs text-muted-foreground truncate">{contact.location}</p>
                              </div>
                              {contact.id === otherContactId && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                            </div>
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {step === 'review' && otherContact && (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            <p className="text-sm font-medium text-foreground">
              Select which values to keep for each field:
            </p>
            {fieldsToCompare.map(field => {
              const currentValue = (currentContact as any)?.[field.key]
              const otherValue = (otherContact as any)?.[field.key]

              // Skip if both are empty
              if (!currentValue && !otherValue) return null

              return (
                <div key={field.key} className="space-y-2">
                  <p className="text-sm font-medium text-foreground">{field.label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleDecision(field.key, 'keep')}
                      className={cn(
                        'p-3 rounded-lg border text-left transition-colors',
                        decisions[field.key] === 'keep'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted border-border hover:border-primary',
                      )}
                    >
                      <p className="text-xs text-muted-foreground/75 mb-1">Keep current</p>
                      <p className="text-sm font-medium truncate">{currentValue || '(empty)'}</p>
                    </button>
                    <button
                      onClick={() => handleDecision(field.key, 'merge')}
                      className={cn(
                        'p-3 rounded-lg border text-left transition-colors',
                        decisions[field.key] === 'merge'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted border-border hover:border-primary',
                      )}
                    >
                      <p className="text-xs text-muted-foreground/75 mb-1">Use other</p>
                      <p className="text-sm font-medium truncate">{otherValue || '(empty)'}</p>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (step === 'review') {
                setStep('select')
                setOtherContactId(null)
                setDecisions({})
              } else {
                onClose()
              }
            }}
          >
            {step === 'select' ? 'Cancel' : 'Back'}
          </Button>
          {step === 'select' && (
            <Button
              onClick={() => setStep('review')}
              disabled={!otherContactId}
            >
              Next
            </Button>
          )}
          {step === 'review' && (
            <Button
              onClick={handleConfirmMerge}
              disabled={mergeMutation.isPending}
              variant="destructive"
            >
              {mergeMutation.isPending ? 'Merging...' : 'Merge Contacts'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
