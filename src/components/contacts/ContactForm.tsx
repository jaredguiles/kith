import { useState } from 'react'
import { Contact, Tag, Group } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { RELATIONSHIP_TYPES } from '@/lib/utils'
import { Check, X } from 'lucide-react'

interface ContactFormProps {
  contact?: Contact | null
  tags?: Tag[]
  onSubmit: (data: any) => Promise<void>
  isLoading?: boolean
}

export function ContactForm({ contact, tags = [], onSubmit, isLoading = false }: ContactFormProps) {
  const [formData, setFormData] = useState({
    first_name: contact?.first_name || '',
    last_name: contact?.last_name || '',
    nickname: contact?.nickname || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    birthday: contact?.birthday || '',
    location: contact?.location || '',
    bio: contact?.bio || '',
    occupation: contact?.occupation || '',
    company: contact?.company || '',
    relationship_type: contact?.relationship_type || '',
    how_we_met: contact?.how_we_met || '',
    notes_text: contact?.notes_text || '',
  })

  const [selectedTags, setSelectedTags] = useState<Tag[]>(contact?.tags || [])
  const [openTagsPopover, setOpenTagsPopover] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const toggleTag = (tag: Tag) => {
    setSelectedTags(prev =>
      prev.find(t => t.id === tag.id)
        ? prev.filter(t => t.id !== tag.id)
        : [...prev, tag]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await onSubmit({
        ...formData,
        tag_ids: selectedTags.map(t => t.id),
      })
    } catch (error) {
      console.error('Form submission error:', error)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">Basic Info</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="first_name">First Name</Label>
            <Input
              id="first_name"
              name="first_name"
              value={formData.first_name}
              onChange={handleInputChange}
              placeholder="First name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">Last Name</Label>
            <Input
              id="last_name"
              name="last_name"
              value={formData.last_name}
              onChange={handleInputChange}
              placeholder="Last name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nickname">Nickname</Label>
            <Input
              id="nickname"
              name="nickname"
              value={formData.nickname}
              onChange={handleInputChange}
              placeholder="Nickname"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="birthday">Birthday</Label>
            <Input
              id="birthday"
              name="birthday"
              type="date"
              value={formData.birthday}
              onChange={handleInputChange}
            />
          </div>
        </div>
      </div>

      {/* Contact Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">Contact</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="email@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              placeholder="(555) 123-4567"
            />
          </div>
          <div className="col-span-2 space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              name="location"
              value={formData.location}
              onChange={handleInputChange}
              placeholder="City, State or Country"
            />
          </div>
        </div>
      </div>

      {/* Professional Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">Professional</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="occupation">Occupation</Label>
            <Input
              id="occupation"
              name="occupation"
              value={formData.occupation}
              onChange={handleInputChange}
              placeholder="Job title"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company">Company</Label>
            <Input
              id="company"
              name="company"
              value={formData.company}
              onChange={handleInputChange}
              placeholder="Company name"
            />
          </div>
        </div>
      </div>

      {/* Relationship Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">Relationship</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="relationship_type">Relationship Type</Label>
            <Select value={formData.relationship_type} onValueChange={(value) => handleSelectChange('relationship_type', value)}>
              <SelectTrigger id="relationship_type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_TYPES.map(type => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="how_we_met">How We Met</Label>
            <Input
              id="how_we_met"
              name="how_we_met"
              value={formData.how_we_met}
              onChange={handleInputChange}
              placeholder="How you met them"
            />
          </div>
        </div>
      </div>

      {/* Bio & Notes */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">Bio & Notes</h3>
        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <textarea
            id="bio"
            name="bio"
            value={formData.bio}
            onChange={handleInputChange}
            placeholder="About this person"
            className="w-full h-20 px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes_text">Notes</Label>
          <textarea
            id="notes_text"
            name="notes_text"
            value={formData.notes_text}
            onChange={handleInputChange}
            placeholder="Private notes"
            className="w-full h-20 px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          />
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-foreground">Tags</h3>
          <Popover open={openTagsPopover} onOpenChange={setOpenTagsPopover}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                {selectedTags.length > 0 ? `${selectedTags.length} tag(s) selected` : 'Select tags'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-3" side="top">
              <Command>
                <CommandInput placeholder="Search tags..." />
                <CommandList>
                  <CommandEmpty>No tags found.</CommandEmpty>
                  <CommandGroup>
                    {tags.map(tag => (
                      <CommandItem
                        key={tag.id}
                        value={String(tag.id)}
                        onSelect={() => toggleTag(tag)}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            selectedTags.find(t => t.id === tag.id) ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <Badge
                          style={{
                            backgroundColor: tag.color || '#6b7280',
                            borderColor: tag.color || '#6b7280',
                            color: '#ffffff',
                          }}
                          className="text-xs"
                        >
                          {tag.name}
                        </Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedTags.map(tag => (
                <div key={tag.id} className="flex items-center gap-1">
                  <Badge
                    style={{
                      backgroundColor: tag.color || '#6b7280',
                      borderColor: tag.color || '#6b7280',
                      color: '#ffffff',
                    }}
                    className="text-xs"
                  >
                    {tag.name}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? 'Saving...' : 'Save Contact'}
      </Button>
    </form>
  )
}
