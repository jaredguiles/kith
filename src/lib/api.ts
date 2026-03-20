const API_BASE = '/api'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('kith_token')
  const spicyMode = localStorage.getItem('kith_spicy') === 'true'

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(spicyMode ? { 'X-Spicy-Mode': 'true' } : {}),
    ...(typeof options.headers === 'object' ? (options.headers as Record<string, string>) : {}),
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    localStorage.removeItem('kith_token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(error.message || `HTTP ${res.status}`)
  }

  return res.json()
}

// Auth
export const auth = {
  login: (data: { username: string; password: string }) =>
    request<{ token: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request<any>('/auth/me'),
  changePassword: (data: { current_password: string; new_password: string }) =>
    request('/auth/password', { method: 'PUT', body: JSON.stringify(data) }),
}

// Users
export const users = {
  list: () => request<any[]>('/users'),
  create: (data: any) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: any) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deactivate: (id: number) => request(`/users/${id}`, { method: 'DELETE' }),
}

// Contacts
export const contacts = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return request<{ contacts: any[]; total: number }>(`/contacts${qs}`)
  },
  get: (id: number) => request<any>(`/contacts/${id}`),
  create: (data: any) => request('/contacts', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: any) => request(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/contacts/${id}`, { method: 'DELETE' }),
  merge: (id: number, otherId: number, decisions: any) =>
    request(`/contacts/${id}/merge/${otherId}`, { method: 'POST', body: JSON.stringify(decisions) }),
  share: (id: number, data: any) => request(`/contacts/${id}/share`, { method: 'POST', body: JSON.stringify(data) }),
  unshare: (id: number, userId: number) => request(`/contacts/${id}/share/${userId}`, { method: 'DELETE' }),
  setPhoto: (id: number, mediaId: number) =>
    request(`/contacts/${id}/photo`, { method: 'PUT', body: JSON.stringify({ media_id: mediaId }) }),
  toggleFavorite: (id: number) => request(`/contacts/${id}/favorite`, { method: 'PUT' }),
  changelog: (id: number) => request<any[]>(`/contacts/${id}/changelog`),
}

// Contact details (emails, phones, addresses)
export const contactDetails = {
  listEmails: (contactId: number) => request<any[]>(`/contacts/${contactId}/emails`),
  addEmail: (contactId: number, data: any) =>
    request(`/contacts/${contactId}/emails`, { method: 'POST', body: JSON.stringify(data) }),
  updateEmail: (id: number, data: any) => request(`/emails/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEmail: (id: number) => request(`/emails/${id}`, { method: 'DELETE' }),
  listPhones: (contactId: number) => request<any[]>(`/contacts/${contactId}/phones`),
  addPhone: (contactId: number, data: any) =>
    request(`/contacts/${contactId}/phones`, { method: 'POST', body: JSON.stringify(data) }),
  updatePhone: (id: number, data: any) => request(`/phones/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePhone: (id: number) => request(`/phones/${id}`, { method: 'DELETE' }),
  listAddresses: (contactId: number) => request<any[]>(`/contacts/${contactId}/addresses`),
  addAddress: (contactId: number, data: any) =>
    request(`/contacts/${contactId}/addresses`, { method: 'POST', body: JSON.stringify(data) }),
  updateAddress: (id: number, data: any) =>
    request(`/addresses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAddress: (id: number) => request(`/addresses/${id}`, { method: 'DELETE' }),
}

// Tags
export const tags = {
  list: () => request<any[]>('/tags'),
  create: (data: any) => request('/tags', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: any) => request(`/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/tags/${id}`, { method: 'DELETE' }),
  addToContact: (tagId: number, contactId: number) =>
    request(`/tags/${tagId}/contacts/${contactId}`, { method: 'POST' }),
  removeFromContact: (tagId: number, contactId: number) =>
    request(`/tags/${tagId}/contacts/${contactId}`, { method: 'DELETE' }),
}

// Groups
export const groups = {
  list: () => request<any[]>('/groups'),
  create: (data: any) => request('/groups', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: any) => request(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/groups/${id}`, { method: 'DELETE' }),
  addMember: (groupId: number, contactId: number) =>
    request(`/groups/${groupId}/members/${contactId}`, { method: 'POST' }),
  removeMember: (groupId: number, contactId: number) =>
    request(`/groups/${groupId}/members/${contactId}`, { method: 'DELETE' }),
}

// Social links
export const socials = {
  list: (contactId: number) => request<any[]>(`/socials?contact_id=${contactId}`),
  create: (data: any) => request('/socials', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: any) => request(`/socials/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/socials/${id}`, { method: 'DELETE' }),
}

// Spicy
export const spicy = {
  get: (contactId: number) => request<any>(`/contacts/${contactId}/spicy`),
  update: (contactId: number, data: any) =>
    request(`/contacts/${contactId}/spicy`, { method: 'PUT', body: JSON.stringify(data) }),
}

// Events
export const events = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return request<any[]>(`/events${qs}`)
  },
  get: (id: number) => request<any>(`/events/${id}`),
  create: (data: any) => request('/events', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: any) => request(`/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/events/${id}`, { method: 'DELETE' }),
}

// Timeline
export const timeline = {
  list: (contactId: number) => request<any[]>(`/timeline?contact_id=${contactId}`),
  create: (data: any) => request('/timeline', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/timeline/${id}`, { method: 'DELETE' }),
}

// Notes
export const notes = {
  list: (contactId: number) => request<any[]>(`/notes?contact_id=${contactId}`),
  create: (data: any) => request('/notes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: any) => request(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/notes/${id}`, { method: 'DELETE' }),
}

// Reminders
export const reminders = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return request<any[]>(`/reminders${qs}`)
  },
  due: () => request<any[]>('/reminders/due'),
  create: (data: any) => request('/reminders', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: any) => request(`/reminders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  complete: (id: number) => request(`/reminders/${id}/complete`, { method: 'POST' }),
  delete: (id: number) => request(`/reminders/${id}`, { method: 'DELETE' }),
}

// Messages
export const messages = {
  list: (contactId: number) => request<any[]>(`/messages?contact_id=${contactId}`),
  create: (data: any) => request('/messages', { method: 'POST', body: JSON.stringify(data) }),
}

// Media
export const media = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return request<any[]>(`/media${qs}`)
  },
  upload: (formData: FormData) => {
    const token = localStorage.getItem('kith_token')
    return fetch(`${API_BASE}/media`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    }).then((r) => r.json())
  },
  update: (id: number, data: any) => request(`/media/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/media/${id}`, { method: 'DELETE' }),
}

// Settings
export const settings = {
  get: () => request<Record<string, any>>('/settings'),
  update: (key: string, data: any) => request(`/settings/${key}`, { method: 'PUT', body: JSON.stringify(data) }),
}

// Preferences
export const preferences = {
  get: () => request<Record<string, any>>('/preferences'),
  update: (key: string, data: any) => request(`/preferences/${key}`, { method: 'PUT', body: JSON.stringify(data) }),
}

// Import
export const importApi = {
  upload: (formData: FormData) => {
    const token = localStorage.getItem('kith_token')
    return fetch(`${API_BASE}/import/upload`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    }).then((r) => r.json())
  },
  jobs: () => request<any[]>('/import/jobs'),
  job: (id: number) => request<any>(`/import/jobs/${id}`),
  review: (jobId?: number) => request<any[]>(`/import/review${jobId ? `?job_id=${jobId}` : ''}`),
  setDecision: (id: number, data: any) =>
    request(`/import/review/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  finalize: (jobId: number) => request(`/import/jobs/${jobId}/finalize`, { method: 'POST' }),
  cancel: (jobId: number) => request(`/import/jobs/${jobId}`, { method: 'DELETE' }),
}

// Audit
export const audit = {
  list: (params: Record<string, string>) => {
    const qs = '?' + new URLSearchParams(params).toString()
    return request<any[]>(`/audit-log${qs}`)
  },
}
