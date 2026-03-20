import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { socials } from '@/lib/api'
import { SocialLink } from '@/types'
import { PLATFORMS } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Plus, Trash2, Edit2, ExternalLink, Globe } from 'lucide-react'

interface ContactSocialTabProps {
  contactId: number
}

const PLATFORM_ICONS: Record<string, string> = {
  Instagram: '📷',
  'Twitter/X': '𝕏',
  LinkedIn: '💼',
  Facebook: 'f',
  TikTok: '🎵',
  Snapchat: '👻',
  YouTube: '▶️',
  GitHub: '🐙',
  Sniffies: '👃',
  Grindr: '🏳️‍🌈',
  Scruff: '🧔',
  Feeld: '💕',
  Hinge: '🔥',
  Tinder: '💘',
  Bumble: '🐝',
  Website: '🌐',
  Other: '🔗',
}

export function ContactSocialTab({ contactId }: ContactSocialTabProps) {
  const qc = useQueryClient()

  const { data: socialLinks = [] } = useQuery({
    queryKey: ['contact-socials', contactId],
    queryFn: () => socials.list(contactId),
  })

  const addMutation = useMutation({
    mutationFn: (data: any) => socials.create({ ...data, contact_id: contactId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-socials', contactId] })
      setAddOpen(false)
      setForm({ platform: '', username: '', url: '' })
      toast.success('Social link added')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => socials.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-socials', contactId] })
      setEditOpen(false)
      setEditingId(null)
      setForm({ platform: '', username: '', url: '' })
      toast.success('Social link updated')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => socials.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-socials', contactId] })
      toast.success('Social link deleted')
    },
  })

  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ platform: '', username: '', url: '' })

  const handleAdd = async () => {
    if (!form.platform) {
      toast.error('Please select a platform')
      return
    }
    if (!form.username && !form.url) {
      toast.error('Please enter a username or URL')
      return
    }

    await addMutation.mutateAsync(form)
  }

  const handleEdit = (social: SocialLink) => {
    setEditingId(social.id)
    setForm({ platform: social.platform, username: social.username || '', url: social.url || '' })
    setEditOpen(true)
  }

  const handleUpdate = async () => {
    if (!form.platform) {
      toast.error('Please select a platform')
      return
    }
    if (!editingId) return

    await updateMutation.mutateAsync({
      id: editingId,
      data: form,
    })
  }

  const handleDelete = async (id: number) => {
    if (confirm('Delete this social link?')) {
      await deleteMutation.mutateAsync(id)
    }
  }

  const buildUrl = (social: SocialLink): string => {
    if (social.url) return social.url
    if (!social.username) return ''

    const baseUrls: Record<string, string> = {
      Instagram: 'https://instagram.com/',
      'Twitter/X': 'https://twitter.com/',
      LinkedIn: 'https://linkedin.com/in/',
      Facebook: 'https://facebook.com/',
      TikTok: 'https://tiktok.com/@',
      Snapchat: 'https://snapchat.com/add/',
      YouTube: 'https://youtube.com/@',
      GitHub: 'https://github.com/',
      Grindr: 'https://grindr.com/',
      Scruff: 'https://scruff.com/',
    }

    return (baseUrls[social.platform] || '') + social.username
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Social Links
        </h3>
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)} className="gap-1">
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>

      <div className="space-y-2">
        {socialLinks.map(social => {
          const url = buildUrl(social)
          return (
            <div key={social.id} className="flex items-center justify-between p-3 rounded-lg bg-muted dark:bg-slate-900">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-lg flex-shrink-0">
                  {PLATFORM_ICONS[social.platform] || '🔗'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">{social.platform}</p>
                  {social.username && (
                    <p className="text-sm text-foreground truncate">@{social.username}</p>
                  )}
                  {!social.username && social.url && (
                    <p className="text-sm text-foreground truncate text-primary">
                      {social.url}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-1 ml-2">
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center h-8 w-8 rounded hover:bg-primary/20"
                  >
                    <ExternalLink className="h-3 w-3 text-primary" />
                  </a>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEdit(social)}
                  className="h-8 w-8"
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(social.id)}
                  className="h-8 w-8 hover:bg-destructive/20"
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          )
        })}
        {socialLinks.length === 0 && <p className="text-sm text-muted-foreground">No social links added</p>}
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Social Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Platform</Label>
              <Select value={form.platform} onValueChange={platform => setForm(prev => ({ ...prev, platform }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(platform => (
                    <SelectItem key={platform} value={platform}>
                      {platform}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Username</Label>
              <Input
                value={form.username}
                onChange={e => setForm(prev => ({ ...prev, username: e.target.value }))}
                placeholder="username"
              />
            </div>
            <div>
              <Label>URL (optional)</Label>
              <Input
                value={form.url}
                onChange={e => setForm(prev => ({ ...prev, url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={addMutation.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Social Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Platform</Label>
              <Select value={form.platform} onValueChange={platform => setForm(prev => ({ ...prev, platform }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(platform => (
                    <SelectItem key={platform} value={platform}>
                      {platform}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Username</Label>
              <Input
                value={form.username}
                onChange={e => setForm(prev => ({ ...prev, username: e.target.value }))}
                placeholder="username"
              />
            </div>
            <div>
              <Label>URL (optional)</Label>
              <Input
                value={form.url}
                onChange={e => setForm(prev => ({ ...prev, url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
