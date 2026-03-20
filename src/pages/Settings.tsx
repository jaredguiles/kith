import { useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { useSettings, useUpdateSettings, useUsers, useCreateUser, useUpdateUser, useDeactivateUser } from '@/hooks/useSettings'
import { useTags } from '@/hooks/useTags'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Trash2, PenLine, Copy, RefreshCw } from 'lucide-react'
import { User, Tag } from '@/types'
import { toast } from 'sonner'

export default function Settings() {
  const { currentUser } = useAppStore()
  const { data: settings = {} } = useSettings()
  const { data: users = [] } = useUsers()
  const { data: tags = [] } = useTags()
  const updateSettings = useUpdateSettings()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const deactivateUser = useDeactivateUser()

  // Check if admin
  const isAdmin = currentUser?.role === 'main_admin' || currentUser?.role === 'admin'
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-muted-foreground">You do not have permission to access settings</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage application settings and users</p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="spicy">Spicy</TabsTrigger>
          <TabsTrigger value="media">Media</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="extension">Extension</TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div>
              <label className="text-sm font-medium">App Name</label>
              <Input
                defaultValue={settings.app_name || 'Kith'}
                onChange={(e) => {
                  updateSettings.mutate({ key: 'app_name', data: { value: e.target.value } })
                }}
                placeholder="Application name"
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">Default Relationship Types</label>
              <div className="space-y-2">
                {(settings.relationship_types || []).map((rt: string, i: number) => (
                  <div key={i} className="flex gap-2">
                    <Input defaultValue={rt} readOnly disabled />
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => {
                        const updated = (settings.relationship_types || []).filter((_: string, idx: number) => idx !== i)
                        updateSettings.mutate({ key: 'relationship_types', data: { value: updated } })
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  const newType = prompt('Enter new relationship type:')
                  if (newType) {
                    const updated = [...(settings.relationship_types || []), newType]
                    updateSettings.mutate({ key: 'relationship_types', data: { value: updated } })
                  }
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Type
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance" className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div>
              <label className="text-sm font-medium">Primary Accent Color</label>
              <div className="flex gap-2 items-center">
                <Input
                  type="color"
                  defaultValue={settings.primary_color || '#3b82f6'}
                  onChange={(e) => {
                    updateSettings.mutate({ key: 'primary_color', data: { value: e.target.value } })
                  }}
                  className="h-10 w-20 cursor-pointer"
                />
                <span className="text-sm text-muted-foreground">{settings.primary_color || '#3b82f6'}</span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Spicy Mode Accent Color</label>
              <div className="flex gap-2 items-center">
                <Input
                  type="color"
                  defaultValue={settings.spicy_color || '#ec4899'}
                  onChange={(e) => {
                    updateSettings.mutate({ key: 'spicy_color', data: { value: e.target.value } })
                  }}
                  className="h-10 w-20 cursor-pointer"
                />
                <span className="text-sm text-muted-foreground">{settings.spicy_color || '#ec4899'}</span>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Spicy Tab */}
        <TabsContent value="spicy" className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">Enable Spicy Features</label>
                <p className="text-xs text-muted-foreground">Allow spicy profile and content</p>
              </div>
              <Switch
                checked={settings.spicy_enabled === true}
                onCheckedChange={(checked) => {
                  updateSettings.mutate({ key: 'spicy_enabled', data: { value: checked } })
                }}
              />
            </div>

            {settings.spicy_enabled && (
              <>
                <div className="border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Require PIN</label>
                      <p className="text-xs text-muted-foreground">Require PIN to access spicy content</p>
                    </div>
                    <Switch
                      checked={settings.spicy_pin_enabled === true}
                      onCheckedChange={(checked) => {
                        updateSettings.mutate({ key: 'spicy_pin_enabled', data: { value: checked } })
                      }}
                    />
                  </div>

                  {settings.spicy_pin_enabled && (
                    <div className="mt-3">
                      <Input
                        type="password"
                        placeholder="Set spicy PIN"
                        onBlur={(e) => {
                          if (e.target.value) {
                            updateSettings.mutate({ key: 'spicy_pin', data: { value: e.target.value } })
                          }
                        }}
                      />
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-4">
                  <label className="text-sm font-medium block mb-2">Auto-Disable Timer</label>
                  <Select
                    defaultValue={settings.spicy_auto_disable || 'never'}
                    onValueChange={(value) => {
                      updateSettings.mutate({ key: 'spicy_auto_disable', data: { value } })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15min">15 minutes</SelectItem>
                      <SelectItem value="30min">30 minutes</SelectItem>
                      <SelectItem value="1hr">1 hour</SelectItem>
                      <SelectItem value="never">Never</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        </TabsContent>

        {/* Media Tab */}
        <TabsContent value="media" className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div>
              <label className="text-sm font-medium">Media Storage Path</label>
              <Input
                defaultValue={settings.media_storage_path || '/media'}
                onChange={(e) => {
                  updateSettings.mutate({ key: 'media_storage_path', data: { value: e.target.value } })
                }}
                placeholder="/media"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Max Upload Size (MB)</label>
              <Input
                type="number"
                defaultValue={settings.max_upload_size || 100}
                onChange={(e) => {
                  updateSettings.mutate({ key: 'max_upload_size', data: { value: parseInt(e.target.value) } })
                }}
                min="1"
                max="1000"
              />
            </div>
          </div>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <Dialog>
            <DialogTrigger asChild>
              <Button className="mb-4">
                <Plus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
              </DialogHeader>
              <CreateUserForm onSubmit={(data) => createUser.mutate(data)} isLoading={createUser.isPending} />
            </DialogContent>
          </Dialog>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left font-medium">Username</th>
                  <th className="px-4 py-2 text-left font-medium">Email</th>
                  <th className="px-4 py-2 text-left font-medium">Role</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user: User) => (
                  <tr key={user.id} className="border-b border-border hover:bg-muted/50">
                    <td className="px-4 py-3">{user.username}</td>
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3 capitalize">{user.role}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded ${user.is_active ? 'bg-green-500/20 text-green-700' : 'bg-red-500/20 text-red-700'}`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <PenLine className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Edit User</DialogTitle>
                          </DialogHeader>
                          <EditUserForm user={user} onSubmit={(data) => updateUser.mutate({ id: user.id, data })} isLoading={updateUser.isPending} />
                        </DialogContent>
                      </Dialog>
                      {user.id !== currentUser?.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Deactivate user ${user.username}?`)) {
                              deactivateUser.mutate(user.id)
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Data Tab */}
        <TabsContent value="data" className="space-y-4">
          <div className="space-y-4">
            {/* Default Tags */}
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="font-semibold mb-3">Default Tags</h3>
              <div className="space-y-2 mb-3">
                {tags.map((tag: Tag) => (
                  <div key={tag.id} className="flex items-center justify-between p-2 bg-muted rounded">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: tag.color || '#gray' }}
                      />
                      <span className="text-sm">{tag.name}</span>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Tag
              </Button>
            </div>

            {/* Default Groups */}
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="font-semibold mb-2">Default Groups</h3>
              <p className="text-sm text-muted-foreground mb-3">Manage default groups on the Groups page</p>
              <Button variant="outline" onClick={() => window.location.href = '/groups'}>
                Go to Groups
              </Button>
            </div>

            {/* Export */}
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="font-semibold mb-2">Export Data</h3>
              <p className="text-sm text-muted-foreground mb-3">Export all your data as JSON</p>
              <Button variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Export All Data
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Chrome Extension Tab */}
        <TabsContent value="extension" className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div>
              <label className="text-sm font-medium">API Token</label>
              <div className="flex gap-2 items-center">
                <Input
                  type="password"
                  defaultValue={settings.api_token || '••••••••••••'}
                  readOnly
                  disabled
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(settings.api_token || '')
                    toast.success('Token copied')
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Copy this token to your browser extension</p>
            </div>

            <div className="border-t border-border pt-4">
              <label className="text-sm font-medium block mb-3">Allowed Platforms</label>
              <div className="space-y-2">
                {['twitter', 'instagram', 'facebook', 'linkedin', 'tiktok'].map((platform) => (
                  <div key={platform} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`platform-${platform}`}
                      defaultChecked={(settings.allowed_platforms || []).includes(platform)}
                      onChange={(e) => {
                        const current = settings.allowed_platforms || []
                        const updated = e.target.checked
                          ? [...current, platform]
                          : current.filter((p: string) => p !== platform)
                        updateSettings.mutate({ key: 'allowed_platforms', data: { value: updated } })
                      }}
                      className="rounded"
                    />
                    <label htmlFor={`platform-${platform}`} className="text-sm capitalize cursor-pointer">
                      {platform}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function CreateUserForm({ onSubmit, isLoading }: { onSubmit: (data: any) => void; isLoading: boolean }) {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    display_name: '',
    role: 'user',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input
        placeholder="Username"
        value={formData.username}
        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
        required
      />
      <Input
        type="email"
        placeholder="Email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        required
      />
      <Input
        type="password"
        placeholder="Password"
        value={formData.password}
        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
        required
      />
      <Input
        placeholder="Display Name"
        value={formData.display_name}
        onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
      />
      <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="user">User</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
        </SelectContent>
      </Select>
      <Button type="submit" className="w-full" disabled={isLoading}>
        Create User
      </Button>
    </form>
  )
}

function EditUserForm({ user, onSubmit, isLoading }: { user: User; onSubmit: (data: any) => void; isLoading: boolean }) {
  const [formData, setFormData] = useState({
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    is_active: user.is_active,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input
        type="email"
        placeholder="Email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        required
      />
      <Input
        placeholder="Display Name"
        value={formData.display_name}
        onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
      />
      <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value as any })}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="user">User</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_active"
          checked={formData.is_active}
          onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
          className="rounded"
        />
        <label htmlFor="is_active" className="text-sm cursor-pointer">
          Active
        </label>
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        Update User
      </Button>
    </form>
  )
}
