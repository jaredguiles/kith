import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactDetails } from '@/lib/api'
import { ContactEmail, ContactPhone, ContactAddress } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Mail, Phone, MapPin, Plus, Trash2, PenLine, X } from 'lucide-react'

interface ContactDetailsTabProps {
  contactId: number
}

export function ContactDetailsTab({ contactId }: ContactDetailsTabProps) {
  const qc = useQueryClient()

  // Queries
  const { data: emails = [] } = useQuery({
    queryKey: ['contact-emails', contactId],
    queryFn: () => contactDetails.listEmails(contactId),
  })

  const { data: phones = [] } = useQuery({
    queryKey: ['contact-phones', contactId],
    queryFn: () => contactDetails.listPhones(contactId),
  })

  const { data: addresses = [] } = useQuery({
    queryKey: ['contact-addresses', contactId],
    queryFn: () => contactDetails.listAddresses(contactId),
  })

  // Mutations
  const addEmailMutation = useMutation({
    mutationFn: (data: any) => contactDetails.addEmail(contactId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-emails', contactId] })
      setAddEmailOpen(false)
    },
  })

  const updateEmailMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => contactDetails.updateEmail(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-emails', contactId] })
      setEditEmailOpen(false)
    },
  })

  const deleteEmailMutation = useMutation({
    mutationFn: (id: number) => contactDetails.deleteEmail(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-emails', contactId] })
    },
  })

  const addPhoneMutation = useMutation({
    mutationFn: (data: any) => contactDetails.addPhone(contactId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-phones', contactId] })
      setAddPhoneOpen(false)
    },
  })

  const updatePhoneMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => contactDetails.updatePhone(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-phones', contactId] })
      setEditPhoneOpen(false)
    },
  })

  const deletePhoneMutation = useMutation({
    mutationFn: (id: number) => contactDetails.deletePhone(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-phones', contactId] })
    },
  })

  const addAddressMutation = useMutation({
    mutationFn: (data: any) => contactDetails.addAddress(contactId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-addresses', contactId] })
      setAddAddressOpen(false)
    },
  })

  const updateAddressMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => contactDetails.updateAddress(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-addresses', contactId] })
      setEditAddressOpen(false)
    },
  })

  const deleteAddressMutation = useMutation({
    mutationFn: (id: number) => contactDetails.deleteAddress(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-addresses', contactId] })
    },
  })

  // State
  const [addEmailOpen, setAddEmailOpen] = useState(false)
  const [editEmailOpen, setEditEmailOpen] = useState(false)
  const [editingEmail, setEditingEmail] = useState<ContactEmail | null>(null)
  const [emailForm, setEmailForm] = useState({ label: '', email: '', is_primary: false })

  const [addPhoneOpen, setAddPhoneOpen] = useState(false)
  const [editPhoneOpen, setEditPhoneOpen] = useState(false)
  const [editingPhone, setEditingPhone] = useState<ContactPhone | null>(null)
  const [phoneForm, setPhoneForm] = useState({ label: '', phone: '', is_primary: false })

  const [addAddressOpen, setAddAddressOpen] = useState(false)
  const [editAddressOpen, setEditAddressOpen] = useState(false)
  const [editingAddress, setEditingAddress] = useState<ContactAddress | null>(null)
  const [addressForm, setAddressForm] = useState({ label: '', street: '', city: '', state: '', zip: '', country: '', is_primary: false })

  // Handlers
  const handleAddEmail = async () => {
    if (!emailForm.email) return
    await addEmailMutation.mutateAsync(emailForm)
    setEmailForm({ label: '', email: '', is_primary: false })
  }

  const handleEditEmail = (email: ContactEmail) => {
    setEditingEmail(email)
    setEmailForm({ label: email.label, email: email.email, is_primary: email.is_primary })
    setEditEmailOpen(true)
  }

  const handleUpdateEmail = async () => {
    if (!emailForm.email || !editingEmail) return
    await updateEmailMutation.mutateAsync({ id: editingEmail.id, data: emailForm })
    setEditingEmail(null)
    setEmailForm({ label: '', email: '', is_primary: false })
  }

  const handleDeleteEmail = async (id: number) => {
    if (confirm('Delete this email?')) {
      await deleteEmailMutation.mutateAsync(id)
    }
  }

  const handleAddPhone = async () => {
    if (!phoneForm.phone) return
    await addPhoneMutation.mutateAsync(phoneForm)
    setPhoneForm({ label: '', phone: '', is_primary: false })
  }

  const handleEditPhone = (phone: ContactPhone) => {
    setEditingPhone(phone)
    setPhoneForm({ label: phone.label, phone: phone.phone, is_primary: phone.is_primary })
    setEditPhoneOpen(true)
  }

  const handleUpdatePhone = async () => {
    if (!phoneForm.phone || !editingPhone) return
    await updatePhoneMutation.mutateAsync({ id: editingPhone.id, data: phoneForm })
    setEditingPhone(null)
    setPhoneForm({ label: '', phone: '', is_primary: false })
  }

  const handleDeletePhone = async (id: number) => {
    if (confirm('Delete this phone?')) {
      await deletePhoneMutation.mutateAsync(id)
    }
  }

  const handleAddAddress = async () => {
    if (!addressForm.street && !addressForm.city) return
    await addAddressMutation.mutateAsync(addressForm)
    setAddressForm({ label: '', street: '', city: '', state: '', zip: '', country: '', is_primary: false })
  }

  const handleEditAddress = (address: ContactAddress) => {
    setEditingAddress(address)
    setAddressForm({
      label: address.label,
      street: address.street || '',
      city: address.city || '',
      state: address.state || '',
      zip: address.zip || '',
      country: address.country || '',
      is_primary: address.is_primary,
    })
    setEditAddressOpen(true)
  }

  const handleUpdateAddress = async () => {
    if (!editingAddress) return
    await updateAddressMutation.mutateAsync({ id: editingAddress.id, data: addressForm })
    setEditingAddress(null)
    setAddressForm({ label: '', street: '', city: '', state: '', zip: '', country: '', is_primary: false })
  }

  const handleDeleteAddress = async (id: number) => {
    if (confirm('Delete this address?')) {
      await deleteAddressMutation.mutateAsync(id)
    }
  }

  return (
    <div className="space-y-8">
      {/* Emails */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Emails
          </h3>
          <Button variant="outline" size="sm" onClick={() => setAddEmailOpen(true)} className="gap-1">
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
        <div className="space-y-2">
          {emails.map(email => (
            <div key={email.id} className="flex items-center justify-between p-3 rounded-lg bg-muted dark:bg-slate-900">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{email.label || 'Email'}</p>
                <p className="text-sm text-foreground truncate">{email.email}</p>
                {email.is_primary && <Badge variant="secondary" className="text-xs mt-1">Primary</Badge>}
              </div>
              <div className="flex gap-1 ml-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEditEmail(email)}
                  className="h-8 w-8"
                >
                  <PenLine className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteEmail(email.id)}
                  className="h-8 w-8 hover:bg-destructive/20"
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          {emails.length === 0 && <p className="text-sm text-muted-foreground">No emails added</p>}
        </div>
      </div>

      <Separator className="dark:bg-slate-800" />

      {/* Phones */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Phone Numbers
          </h3>
          <Button variant="outline" size="sm" onClick={() => setAddPhoneOpen(true)} className="gap-1">
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
        <div className="space-y-2">
          {phones.map(phone => (
            <div key={phone.id} className="flex items-center justify-between p-3 rounded-lg bg-muted dark:bg-slate-900">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{phone.label || 'Phone'}</p>
                <p className="text-sm text-foreground truncate">{phone.phone}</p>
                {phone.is_primary && <Badge variant="secondary" className="text-xs mt-1">Primary</Badge>}
              </div>
              <div className="flex gap-1 ml-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEditPhone(phone)}
                  className="h-8 w-8"
                >
                  <PenLine className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeletePhone(phone.id)}
                  className="h-8 w-8 hover:bg-destructive/20"
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          {phones.length === 0 && <p className="text-sm text-muted-foreground">No phone numbers added</p>}
        </div>
      </div>

      <Separator className="dark:bg-slate-800" />

      {/* Addresses */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Addresses
          </h3>
          <Button variant="outline" size="sm" onClick={() => setAddAddressOpen(true)} className="gap-1">
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
        <div className="space-y-2">
          {addresses.map(address => (
            <div key={address.id} className="flex items-center justify-between p-3 rounded-lg bg-muted dark:bg-slate-900">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{address.label || 'Address'}</p>
                <p className="text-sm text-foreground">
                  {[address.street, address.city, address.state, address.zip, address.country]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                {address.is_primary && <Badge variant="secondary" className="text-xs mt-1">Primary</Badge>}
              </div>
              <div className="flex gap-1 ml-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEditAddress(address)}
                  className="h-8 w-8"
                >
                  <PenLine className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteAddress(address.id)}
                  className="h-8 w-8 hover:bg-destructive/20"
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          {addresses.length === 0 && <p className="text-sm text-muted-foreground">No addresses added</p>}
        </div>
      </div>

      {/* Add Email Dialog */}
      <Dialog open={addEmailOpen} onOpenChange={setAddEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Label</Label>
              <Input
                value={emailForm.label}
                onChange={e => setEmailForm(prev => ({ ...prev, label: e.target.value }))}
                placeholder="e.g., Work, Personal"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={emailForm.email}
                onChange={e => setEmailForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="email@example.com"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="email-primary"
                checked={emailForm.is_primary}
                onChange={e => setEmailForm(prev => ({ ...prev, is_primary: e.target.checked }))}
              />
              <Label htmlFor="email-primary" className="cursor-pointer">Mark as primary</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddEmailOpen(false)}>Cancel</Button>
            <Button onClick={handleAddEmail} disabled={addEmailMutation.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Email Dialog */}
      <Dialog open={editEmailOpen} onOpenChange={setEditEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Label</Label>
              <Input
                value={emailForm.label}
                onChange={e => setEmailForm(prev => ({ ...prev, label: e.target.value }))}
                placeholder="e.g., Work, Personal"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={emailForm.email}
                onChange={e => setEmailForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="email@example.com"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="email-primary-edit"
                checked={emailForm.is_primary}
                onChange={e => setEmailForm(prev => ({ ...prev, is_primary: e.target.checked }))}
              />
              <Label htmlFor="email-primary-edit" className="cursor-pointer">Mark as primary</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEmailOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateEmail} disabled={updateEmailMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Phone Dialog */}
      <Dialog open={addPhoneOpen} onOpenChange={setAddPhoneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Phone Number</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Label</Label>
              <Input
                value={phoneForm.label}
                onChange={e => setPhoneForm(prev => ({ ...prev, label: e.target.value }))}
                placeholder="e.g., Mobile, Home"
              />
            </div>
            <div>
              <Label>Phone Number</Label>
              <Input
                value={phoneForm.phone}
                onChange={e => setPhoneForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="+1 (555) 123-4567"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="phone-primary"
                checked={phoneForm.is_primary}
                onChange={e => setPhoneForm(prev => ({ ...prev, is_primary: e.target.checked }))}
              />
              <Label htmlFor="phone-primary" className="cursor-pointer">Mark as primary</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPhoneOpen(false)}>Cancel</Button>
            <Button onClick={handleAddPhone} disabled={addPhoneMutation.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Phone Dialog */}
      <Dialog open={editPhoneOpen} onOpenChange={setEditPhoneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Phone Number</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Label</Label>
              <Input
                value={phoneForm.label}
                onChange={e => setPhoneForm(prev => ({ ...prev, label: e.target.value }))}
                placeholder="e.g., Mobile, Home"
              />
            </div>
            <div>
              <Label>Phone Number</Label>
              <Input
                value={phoneForm.phone}
                onChange={e => setPhoneForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="+1 (555) 123-4567"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="phone-primary-edit"
                checked={phoneForm.is_primary}
                onChange={e => setPhoneForm(prev => ({ ...prev, is_primary: e.target.checked }))}
              />
              <Label htmlFor="phone-primary-edit" className="cursor-pointer">Mark as primary</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPhoneOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdatePhone} disabled={updatePhoneMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Address Dialog */}
      <Dialog open={addAddressOpen} onOpenChange={setAddAddressOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Address</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Label</Label>
              <Input
                value={addressForm.label}
                onChange={e => setAddressForm(prev => ({ ...prev, label: e.target.value }))}
                placeholder="e.g., Home, Work"
              />
            </div>
            <div>
              <Label>Street</Label>
              <Input
                value={addressForm.street}
                onChange={e => setAddressForm(prev => ({ ...prev, street: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>City</Label>
                <Input
                  value={addressForm.city}
                  onChange={e => setAddressForm(prev => ({ ...prev, city: e.target.value }))}
                />
              </div>
              <div>
                <Label>State</Label>
                <Input
                  value={addressForm.state}
                  onChange={e => setAddressForm(prev => ({ ...prev, state: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>ZIP</Label>
                <Input
                  value={addressForm.zip}
                  onChange={e => setAddressForm(prev => ({ ...prev, zip: e.target.value }))}
                />
              </div>
              <div>
                <Label>Country</Label>
                <Input
                  value={addressForm.country}
                  onChange={e => setAddressForm(prev => ({ ...prev, country: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="address-primary"
                checked={addressForm.is_primary}
                onChange={e => setAddressForm(prev => ({ ...prev, is_primary: e.target.checked }))}
              />
              <Label htmlFor="address-primary" className="cursor-pointer">Mark as primary</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddAddressOpen(false)}>Cancel</Button>
            <Button onClick={handleAddAddress} disabled={addAddressMutation.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Address Dialog */}
      <Dialog open={editAddressOpen} onOpenChange={setEditAddressOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Address</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Label</Label>
              <Input
                value={addressForm.label}
                onChange={e => setAddressForm(prev => ({ ...prev, label: e.target.value }))}
                placeholder="e.g., Home, Work"
              />
            </div>
            <div>
              <Label>Street</Label>
              <Input
                value={addressForm.street}
                onChange={e => setAddressForm(prev => ({ ...prev, street: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>City</Label>
                <Input
                  value={addressForm.city}
                  onChange={e => setAddressForm(prev => ({ ...prev, city: e.target.value }))}
                />
              </div>
              <div>
                <Label>State</Label>
                <Input
                  value={addressForm.state}
                  onChange={e => setAddressForm(prev => ({ ...prev, state: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>ZIP</Label>
                <Input
                  value={addressForm.zip}
                  onChange={e => setAddressForm(prev => ({ ...prev, zip: e.target.value }))}
                />
              </div>
              <div>
                <Label>Country</Label>
                <Input
                  value={addressForm.country}
                  onChange={e => setAddressForm(prev => ({ ...prev, country: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="address-primary-edit"
                checked={addressForm.is_primary}
                onChange={e => setAddressForm(prev => ({ ...prev, is_primary: e.target.checked }))}
              />
              <Label htmlFor="address-primary-edit" className="cursor-pointer">Mark as primary</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAddressOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateAddress} disabled={updateAddressMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
