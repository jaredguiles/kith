import { useState } from 'react'
import { Contact, Tag, Group } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useTags } from '@/hooks/useTags'
import { useGroups } from '@/hooks/useGroups'
import { useUpdateContact } from '@/hooks/useContacts'
import { tags as tagsApi, groups as groupsApi } from '@/lib/api'
import { formatDate, cn } from '@/lib/utils'
import { StarRating } from '@/components/shared/StarRating'
import { TagBadge } from '@/components/shared/TagBadge'
import { GroupBadge } from '@/components/shared/GroupBadge'
import { Plus, X, Calendar, Cake, Heart, Users, Tag as TagIcon } from 'lucide-react'

interface ContactInfoTabProps {
  contact: Contact
}

function calculateAge(birthday: string): number {
  const today = new Date()
  const birth = new Date(birthday)
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age
}

function getZodiacSign(birthday: string): string {
  const date = new Date(birthday)
  const month = date.getMonth() + 1
  const day = date.getDate()

  const zodiacSigns = [
    { sign: 'Capricorn', start: [12, 22], end: [1, 19] },
    { sign: 'Aquarius', start: [1, 20], end: [2, 18] },
    { sign: 'Pisces', start: [2, 19], end: [3, 20] },
    { sign: 'Aries', start: [3, 21], end: [4, 19] },
    { sign: 'Taurus', start: [4, 20], end: [5, 20] },
    { sign: 'Gemini', start: [5, 21], end: [6, 20] },
    { sign: 'Cancer', start: [6, 21], end: [7, 22] },
    { sign: 'Leo', start: [7, 23], end: [8, 22] },
    { sign: 'Virgo', start: [8, 23], end: [9, 22] },
    { sign: 'Libra', start: [9, 23], end: [10, 22] },
    { sign: 'Scorpio', start: [10, 23], end: [11, 21] },
    { sign: 'Sagittarius', start: [11, 22], end: [12, 21] },
  ]

  for (const z of zodiacSigns) {
    const [startMonth, startDay] = z.start
    const [endMonth, endDay] = z.end

    if (startMonth === endMonth) {
      if (month === startMonth && day >= startDay && day <= endDay) return z.sign
    } else {
      if ((month === startMonth && day >= startDay) || (month === endMonth && day <= endDay)) return z.sign
    }
  }

  return ''
}

export function ContactInfoTab({ contact }: ContactInfoTabProps) {
  const updateContact = useUpdateContact()
  const { data: allTags = [] } = useTags()
  const { data: allGroups = [] } = useGroups()

  const [openTagsPopover, setOpenTagsPopover] = useState(false)
  const [openGroupsPopover, setOpenGroupsPopover] = useState(false)

  const handleAddTag = async (tag: Tag) => {
    if (contact.tags?.find(t => t.id === tag.id)) return
    const newTags = [...(contact.tags || []), tag]
    await tagsApi.addToContact(tag.id, contact.id)
    setOpenTagsPopover(false)
  }

  const handleRemoveTag = async (tagId: number) => {
    await tagsApi.removeFromContact(tagId, contact.id)
  }

  const handleAddGroup = async (group: Group) => {
    if (contact.groups?.find(g => g.id === group.id)) return
    await groupsApi.addMember(group.id, contact.id)
    setOpenGroupsPopover(false)
  }

  const handleRemoveGroup = async (groupId: number) => {
    await groupsApi.removeMember(groupId, contact.id)
  }

  const age = contact.birthday ? calculateAge(contact.birthday) : null
  const zodiac = contact.birthday ? getZodiacSign(contact.birthday) : null

  return (
    <div className="space-y-8">
      {/* Basic Info */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Basic Information</h3>
        <div className="grid gap-4">
          {contact.first_name && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">First Name</label>
              <p className="text-sm text-foreground">{contact.first_name}</p>
            </div>
          )}
          {contact.last_name && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Last Name</label>
              <p className="text-sm text-foreground">{contact.last_name}</p>
            </div>
          )}
          {contact.nickname && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nickname</label>
              <p className="text-sm text-foreground">{contact.nickname}</p>
            </div>
          )}
        </div>
      </div>

      <Separator className="dark:bg-slate-800" />

      {/* Personal Details */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Personal Details</h3>
        <div className="grid gap-4">
          {contact.birthday && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Birthday
              </label>
              <p className="text-sm text-foreground">{formatDate(contact.birthday)}</p>
              <div className="flex gap-2">
                {age !== null && <Badge variant="secondary">{age} years old</Badge>}
                {zodiac && <Badge variant="secondary">{zodiac}</Badge>}
              </div>
            </div>
          )}
          {contact.pronouns && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Pronouns</label>
              <p className="text-sm text-foreground">{contact.pronouns}</p>
            </div>
          )}
          {contact.sex && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Sex</label>
              <p className="text-sm text-foreground">{contact.sex}</p>
            </div>
          )}
          {contact.orientation && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Orientation</label>
              <p className="text-sm text-foreground">{contact.orientation}</p>
            </div>
          )}
          {contact.relationship_status && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Relationship Status</label>
              <p className="text-sm text-foreground">{contact.relationship_status}</p>
            </div>
          )}
        </div>
      </div>

      <Separator className="dark:bg-slate-800" />

      {/* Professional Info */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Professional</h3>
        <div className="grid gap-4">
          {contact.occupation && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Occupation</label>
              <p className="text-sm text-foreground">{contact.occupation}</p>
            </div>
          )}
          {contact.company && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Company</label>
              <p className="text-sm text-foreground">{contact.company}</p>
            </div>
          )}
          {contact.website && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Website</label>
              <a
                href={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                {contact.website}
              </a>
            </div>
          )}
        </div>
      </div>

      <Separator className="dark:bg-slate-800" />

      {/* How We Met */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Connection</h3>
        <div className="grid gap-4">
          {contact.how_we_met && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">How We Met</label>
              <p className="text-sm text-foreground">{contact.how_we_met}</p>
            </div>
          )}
          {contact.met_date && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Met Date</label>
              <p className="text-sm text-foreground">{formatDate(contact.met_date)}</p>
            </div>
          )}
          {contact.languages && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Languages</label>
              <p className="text-sm text-foreground">{contact.languages}</p>
            </div>
          )}
          {contact.ethnicity && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Ethnicity</label>
              <p className="text-sm text-foreground">{contact.ethnicity}</p>
            </div>
          )}
        </div>
      </div>

      <Separator className="dark:bg-slate-800" />

      {/* Rating */}
      {contact.rating > 0 && (
        <>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Rating</label>
            <StarRating rating={contact.rating} readOnly />
          </div>
          <Separator className="dark:bg-slate-800" />
        </>
      )}

      {/* Bio */}
      {contact.bio && (
        <>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Bio</label>
            <p className="text-sm text-foreground whitespace-pre-wrap mt-2">{contact.bio}</p>
          </div>
          <Separator className="dark:bg-slate-800" />
        </>
      )}

      {/* Notes */}
      {contact.notes_text && (
        <>
          <div>
            <label className="text-xs font-medium text-muted-foreground">General Notes</label>
            <p className="text-sm text-foreground whitespace-pre-wrap mt-2">{contact.notes_text}</p>
          </div>
          <Separator className="dark:bg-slate-800" />
        </>
      )}

      {/* Tags */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TagIcon className="h-4 w-4" />
            Tags
          </label>
          <Popover open={openTagsPopover} onOpenChange={setOpenTagsPopover}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 gap-1">
                <Plus className="h-3 w-3" />
                Add
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="end">
              <Command>
                <CommandInput placeholder="Search tags..." />
                <CommandEmpty>No tags found.</CommandEmpty>
                <CommandList>
                  <CommandGroup>
                    {allTags.map(tag => (
                      <CommandItem
                        key={tag.id}
                        onSelect={() => handleAddTag(tag)}
                        disabled={contact.tags?.some(t => t.id === tag.id)}
                      >
                        {tag.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-wrap gap-2">
          {contact.tags?.map(tag => (
            <div key={tag.id} className="flex items-center gap-1">
              <TagBadge tag={tag} />
              <button
                onClick={() => handleRemoveTag(tag.id)}
                className="ml-1 inline-flex items-center rounded-full hover:bg-destructive/20"
              >
                <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Groups */}
      {(allGroups.length > 0 || contact.groups?.length) && (
        <>
          <Separator className="dark:bg-slate-800" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Groups
              </label>
              <Popover open={openGroupsPopover} onOpenChange={setOpenGroupsPopover}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 gap-1">
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0" align="end">
                  <Command>
                    <CommandInput placeholder="Search groups..." />
                    <CommandEmpty>No groups found.</CommandEmpty>
                    <CommandList>
                      <CommandGroup>
                        {allGroups.map(group => (
                          <CommandItem
                            key={group.id}
                            onSelect={() => handleAddGroup(group)}
                            disabled={contact.groups?.some(g => g.id === group.id)}
                          >
                            {group.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex flex-wrap gap-2">
              {contact.groups?.map(group => (
                <div key={group.id} className="flex items-center gap-1">
                  <GroupBadge group={group} />
                  <button
                    onClick={() => handleRemoveGroup(group.id)}
                    className="ml-1 inline-flex items-center rounded-full hover:bg-destructive/20"
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
