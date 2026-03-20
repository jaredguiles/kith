import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { spicy } from '@/lib/api'
import { SpicyProfile } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { StarRating } from '@/components/shared/StarRating'
import { Switch } from '@/components/ui/switch'
import { Plus, X } from 'lucide-react'

interface ContactSpicyTabProps {
  contactId: number
}

export function ContactSpicyTab({ contactId }: ContactSpicyTabProps) {
  const qc = useQueryClient()

  const { data: spicyProfile } = useQuery({
    queryKey: ['contact-spicy', contactId],
    queryFn: () => spicy.get(contactId),
  })

  const updateMutation = useMutation({
    mutationFn: (data: any) => spicy.update(contactId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-spicy', contactId] })
      toast.success('Spicy profile updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const [form, setForm] = useState<Partial<SpicyProfile>>({})
  const [kinksInput, setKinksInput] = useState('')
  const [turnOnsInput, setTurnOnsInput] = useState('')
  const [turnOffsInput, setTurnOffsInput] = useState('')

  useEffect(() => {
    if (spicyProfile) {
      setForm({
        spicy_type: spicyProfile.spicy_type || '',
        orientation: spicyProfile.orientation || '',
        role_preference: spicyProfile.role_preference || '',
        positions: spicyProfile.positions || '',
        kinks: spicyProfile.kinks || '',
        turn_ons: spicyProfile.turn_ons || '',
        turn_offs: spicyProfile.turn_offs || '',
        boundaries: spicyProfile.boundaries || '',
        safe_word: spicyProfile.safe_word || '',
        protection_preference: spicyProfile.protection_preference || '',
        hiv_status: spicyProfile.hiv_status || '',
        on_prep: spicyProfile.on_prep || false,
        prep_since: spicyProfile.prep_since || '',
        last_tested_date: spicyProfile.last_tested_date || '',
        sti_notes: spicyProfile.sti_notes || '',
        body_type: spicyProfile.body_type || '',
        body_notes: spicyProfile.body_notes || '',
        endowment: spicyProfile.endowment || '',
        grooming: spicyProfile.grooming || '',
        spicy_rating: spicyProfile.spicy_rating || 0,
        chemistry_rating: spicyProfile.chemistry_rating || 0,
        would_repeat: spicyProfile.would_repeat || false,
        spicy_notes: spicyProfile.spicy_notes || '',
        last_encounter: spicyProfile.last_encounter || '',
        encounter_count: spicyProfile.encounter_count || 0,
      })
    }
  }, [spicyProfile])

  const parseList = (str: string): string[] => {
    return str
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
  }

  const parseKinks = () => parseList(form.kinks || '')
  const parseTurnOns = () => parseList(form.turn_ons || '')
  const parseTurnOffs = () => parseList(form.turn_offs || '')

  const addKink = (kink: string) => {
    const kinks = parseKinks()
    if (!kinks.includes(kink)) {
      setForm(prev => ({
        ...prev,
        kinks: (prev.kinks || '') ? prev.kinks + ', ' + kink : kink,
      }))
    }
    setKinksInput('')
  }

  const removeKink = (kink: string) => {
    const kinks = parseKinks().filter(k => k !== kink)
    setForm(prev => ({ ...prev, kinks: kinks.join(', ') }))
  }

  const addTurnOn = (turnOn: string) => {
    const turnOns = parseTurnOns()
    if (!turnOns.includes(turnOn)) {
      setForm(prev => ({
        ...prev,
        turn_ons: (prev.turn_ons || '') ? prev.turn_ons + ', ' + turnOn : turnOn,
      }))
    }
    setTurnOnsInput('')
  }

  const removeTurnOn = (turnOn: string) => {
    const turnOns = parseTurnOns().filter(t => t !== turnOn)
    setForm(prev => ({ ...prev, turn_ons: turnOns.join(', ') }))
  }

  const addTurnOff = (turnOff: string) => {
    const turnOffs = parseTurnOffs()
    if (!turnOffs.includes(turnOff)) {
      setForm(prev => ({
        ...prev,
        turn_offs: (prev.turn_offs || '') ? prev.turn_offs + ', ' + turnOff : turnOff,
      }))
    }
    setTurnOffsInput('')
  }

  const removeTurnOff = (turnOff: string) => {
    const turnOffs = parseTurnOffs().filter(t => t !== turnOff)
    setForm(prev => ({ ...prev, turn_offs: turnOffs.join(', ') }))
  }

  const handleSave = () => {
    updateMutation.mutate(form)
  }

  return (
    <div className="space-y-8">
      {/* Preferences */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Preferences</h3>
        <div className="grid gap-4">
          <div>
            <Label>Spicy Type</Label>
            <Input
              value={form.spicy_type || ''}
              onChange={e => setForm(prev => ({ ...prev, spicy_type: e.target.value }))}
              placeholder="e.g., Switch, Top, Bottom"
            />
          </div>
          <div>
            <Label>Orientation</Label>
            <Input
              value={form.orientation || ''}
              onChange={e => setForm(prev => ({ ...prev, orientation: e.target.value }))}
              placeholder="e.g., Gay, Straight, Bi"
            />
          </div>
          <div>
            <Label>Role Preference</Label>
            <Input
              value={form.role_preference || ''}
              onChange={e => setForm(prev => ({ ...prev, role_preference: e.target.value }))}
            />
          </div>
          <div>
            <Label>Positions</Label>
            <Input
              value={form.positions || ''}
              onChange={e => setForm(prev => ({ ...prev, positions: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <Separator className="dark:bg-slate-800" />

      {/* Kinks & Interests */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Kinks & Interests</h3>
        <div className="space-y-4">
          {/* Kinks */}
          <div>
            <Label>Kinks</Label>
            <div className="flex gap-2 mt-2">
              <Input
                value={kinksInput}
                onChange={e => setKinksInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addKink(kinksInput)
                  }
                }}
                placeholder="Add a kink..."
              />
              <Button
                onClick={() => addKink(kinksInput)}
                disabled={!kinksInput.trim()}
                size="sm"
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {parseKinks().map(kink => (
                <Badge key={kink} variant="secondary" className="gap-1">
                  {kink}
                  <button onClick={() => removeKink(kink)} className="ml-1 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {/* Turn-ons */}
          <div>
            <Label>Turn-Ons</Label>
            <div className="flex gap-2 mt-2">
              <Input
                value={turnOnsInput}
                onChange={e => setTurnOnsInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTurnOn(turnOnsInput)
                  }
                }}
                placeholder="Add a turn-on..."
              />
              <Button
                onClick={() => addTurnOn(turnOnsInput)}
                disabled={!turnOnsInput.trim()}
                size="sm"
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {parseTurnOns().map(turnOn => (
                <Badge key={turnOn} variant="secondary" className="gap-1">
                  {turnOn}
                  <button onClick={() => removeTurnOn(turnOn)} className="ml-1 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {/* Turn-offs */}
          <div>
            <Label>Turn-Offs</Label>
            <div className="flex gap-2 mt-2">
              <Input
                value={turnOffsInput}
                onChange={e => setTurnOffsInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTurnOff(turnOffsInput)
                  }
                }}
                placeholder="Add a turn-off..."
              />
              <Button
                onClick={() => addTurnOff(turnOffsInput)}
                disabled={!turnOffsInput.trim()}
                size="sm"
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {parseTurnOffs().map(turnOff => (
                <Badge key={turnOff} variant="secondary" className="gap-1">
                  {turnOff}
                  <button onClick={() => removeTurnOff(turnOff)} className="ml-1 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Separator className="dark:bg-slate-800" />

      {/* Boundaries & Safety */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Boundaries & Safety</h3>
        <div className="grid gap-4">
          <div>
            <Label>Boundaries</Label>
            <Textarea
              value={form.boundaries || ''}
              onChange={e => setForm(prev => ({ ...prev, boundaries: e.target.value }))}
              placeholder="What are your boundaries?"
              rows={3}
            />
          </div>
          <div>
            <Label>Safe Word</Label>
            <Input
              value={form.safe_word || ''}
              onChange={e => setForm(prev => ({ ...prev, safe_word: e.target.value }))}
            />
          </div>
          <div>
            <Label>Protection Preference</Label>
            <Input
              value={form.protection_preference || ''}
              onChange={e => setForm(prev => ({ ...prev, protection_preference: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <Separator className="dark:bg-slate-800" />

      {/* Health & Status */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Health & Status</h3>
        <div className="grid gap-4">
          <div>
            <Label>HIV Status</Label>
            <Input
              value={form.hiv_status || ''}
              onChange={e => setForm(prev => ({ ...prev, hiv_status: e.target.value }))}
              placeholder="e.g., Negative, Positive, Unknown"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="on-prep"
              checked={form.on_prep || false}
              onChange={e => setForm(prev => ({ ...prev, on_prep: e.target.checked }))}
            />
            <Label htmlFor="on-prep" className="cursor-pointer">On PrEP</Label>
          </div>
          {form.on_prep && (
            <div>
              <Label>On PrEP Since</Label>
              <Input
                type="date"
                value={form.prep_since || ''}
                onChange={e => setForm(prev => ({ ...prev, prep_since: e.target.value }))}
              />
            </div>
          )}
          <div>
            <Label>Last Tested</Label>
            <Input
              type="date"
              value={form.last_tested_date || ''}
              onChange={e => setForm(prev => ({ ...prev, last_tested_date: e.target.value }))}
            />
          </div>
          <div>
            <Label>STI Notes</Label>
            <Textarea
              value={form.sti_notes || ''}
              onChange={e => setForm(prev => ({ ...prev, sti_notes: e.target.value }))}
              rows={2}
            />
          </div>
        </div>
      </div>

      <Separator className="dark:bg-slate-800" />

      {/* Body & Physical */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Body & Physical</h3>
        <div className="grid gap-4">
          <div>
            <Label>Body Type</Label>
            <Input
              value={form.body_type || ''}
              onChange={e => setForm(prev => ({ ...prev, body_type: e.target.value }))}
            />
          </div>
          <div>
            <Label>Body Notes</Label>
            <Textarea
              value={form.body_notes || ''}
              onChange={e => setForm(prev => ({ ...prev, body_notes: e.target.value }))}
              rows={2}
            />
          </div>
          <div>
            <Label>Endowment</Label>
            <Input
              value={form.endowment || ''}
              onChange={e => setForm(prev => ({ ...prev, endowment: e.target.value }))}
            />
          </div>
          <div>
            <Label>Grooming</Label>
            <Input
              value={form.grooming || ''}
              onChange={e => setForm(prev => ({ ...prev, grooming: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <Separator className="dark:bg-slate-800" />

      {/* Ratings & History */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Ratings & History</h3>
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">Spicy Rating</Label>
            <StarRating
              rating={form.spicy_rating || 0}
              onRating={rating => setForm(prev => ({ ...prev, spicy_rating: rating }))}
            />
          </div>
          <div>
            <Label className="mb-2 block">Chemistry Rating</Label>
            <StarRating
              rating={form.chemistry_rating || 0}
              onRating={rating => setForm(prev => ({ ...prev, chemistry_rating: rating }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="would-repeat"
              checked={form.would_repeat || false}
              onChange={e => setForm(prev => ({ ...prev, would_repeat: e.target.checked }))}
            />
            <Label htmlFor="would-repeat" className="cursor-pointer">Would Repeat</Label>
          </div>
          <div>
            <Label>Last Encounter</Label>
            <Input
              type="date"
              value={form.last_encounter || ''}
              onChange={e => setForm(prev => ({ ...prev, last_encounter: e.target.value }))}
            />
          </div>
          <div>
            <Label>Encounter Count</Label>
            <Input
              type="number"
              min="0"
              value={form.encounter_count || 0}
              onChange={e => setForm(prev => ({ ...prev, encounter_count: parseInt(e.target.value) || 0 }))}
            />
          </div>
        </div>
      </div>

      <Separator className="dark:bg-slate-800" />

      {/* Notes */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Spicy Notes</h3>
        <Textarea
          value={form.spicy_notes || ''}
          onChange={e => setForm(prev => ({ ...prev, spicy_notes: e.target.value }))}
          placeholder="Additional notes..."
          rows={4}
        />
      </div>

      {/* Save Button */}
      <Button onClick={handleSave} disabled={updateMutation.isPending} className="w-full">
        {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  )
}
