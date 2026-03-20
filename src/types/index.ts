export interface User {
  id: number
  username: string
  email: string
  display_name: string
  role: 'main_admin' | 'admin' | 'user'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Contact {
  id: number
  owner_user_id: number
  display_name: string
  first_name: string | null
  last_name: string | null
  nickname: string | null
  email: string | null
  phone: string | null
  birthday: string | null
  age: number | null
  sex: string | null
  pronouns: string | null
  orientation: string | null
  relationship_status: string | null
  location: string | null
  photo_url: string | null
  bio: string | null
  occupation: string | null
  company: string | null
  website: string | null
  zodiac_sign: string | null
  languages: string | null
  ethnicity: string | null
  how_we_met: string | null
  met_date: string | null
  rating: number
  relationship_type: string | null
  is_favorite: boolean
  is_spicy: boolean
  is_anonymous: boolean
  notes_text: string | null
  created_at: string
  updated_at: string
  // Joined data
  tags?: Tag[]
  groups?: Group[]
  social_links?: SocialLink[]
  emails?: ContactEmail[]
  phones?: ContactPhone[]
  addresses?: ContactAddress[]
  spicy_profile?: SpicyProfile | null
  is_shared?: boolean
  share_permissions?: string
  share_scope?: string
}

export interface ContactEmail {
  id: number
  contact_id: number
  label: string
  email: string
  is_primary: boolean
  created_at: string
}

export interface ContactPhone {
  id: number
  contact_id: number
  label: string
  phone: string
  is_primary: boolean
  created_at: string
}

export interface ContactAddress {
  id: number
  contact_id: number
  label: string
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
  is_primary: boolean
  created_at: string
}

export interface Tag {
  id: number
  name: string
  color: string | null
  owner_user_id: number | null
  created_at: string
}

export interface Group {
  id: number
  name: string
  color: string | null
  icon: string | null
  description: string | null
  owner_user_id: number | null
  is_system: boolean
  created_at: string
  member_count?: number
  members?: Contact[]
}

export interface SocialLink {
  id: number
  contact_id: number
  platform: string
  url: string | null
  username: string | null
  created_at: string
}

export interface SpicyProfile {
  id: number
  contact_id: number
  spicy_type: string | null
  orientation: string | null
  role_preference: string | null
  positions: string | null
  kinks: string | null
  turn_ons: string | null
  turn_offs: string | null
  boundaries: string | null
  safe_word: string | null
  protection_preference: string | null
  hiv_status: string | null
  on_prep: boolean | null
  prep_since: string | null
  last_tested_date: string | null
  sti_notes: string | null
  body_type: string | null
  body_notes: string | null
  endowment: string | null
  grooming: string | null
  spicy_rating: number | null
  chemistry_rating: number | null
  would_repeat: boolean | null
  spicy_notes: string | null
  last_encounter: string | null
  encounter_count: number
  created_at: string
  updated_at: string
}

export interface Event {
  id: number
  owner_user_id: number
  title: string
  type: string | null
  description: string | null
  location: string | null
  is_spicy: boolean
  starts_at: string
  ends_at: string | null
  status: 'upcoming' | 'completed' | 'cancelled'
  followup_notes: string | null
  rating: number | null
  created_at: string
  updated_at: string
  contacts?: Contact[]
}

export interface TimelineEvent {
  id: number
  contact_id: number
  event_id: number | null
  type: string
  title: string
  description: string | null
  is_spicy: boolean
  occurred_at: string
  created_at: string
}

export interface Note {
  id: number
  contact_id: number
  content: string
  is_spicy: boolean
  created_at: string
  updated_at: string
}

export interface Reminder {
  id: number
  owner_user_id: number
  contact_id: number | null
  title: string
  description: string | null
  due_at: string
  completed_at: string | null
  created_at: string
}

export interface Message {
  id: number
  contact_id: number
  platform: string
  direction: 'in' | 'out'
  content: string
  is_spicy: boolean
  sent_at: string
  created_at: string
}

export interface MediaAsset {
  id: number
  contact_id: number | null
  owner_user_id: number
  type: 'photo' | 'video'
  file_path: string
  thumbnail_path: string | null
  caption: string | null
  is_spicy: boolean
  is_profile_eligible: boolean
  created_at: string
}

export interface AuditLogEntry {
  id: number
  user_id: number
  contact_id: number | null
  action: string
  entity_type: string
  entity_id: number
  old_values: any
  new_values: any
  description: string
  created_at: string
}

export interface FieldChange {
  id: number
  contact_id: number
  user_id: number | null
  import_job_id: number | null
  source: string
  field_name: string
  old_value: string | null
  new_value: string | null
  changed_at: string
}

export interface ImportJob {
  id: number
  user_id: number
  source_platform: string
  status: 'queued' | 'processing' | 'awaiting_review' | 'complete' | 'error'
  filename: string | null
  is_spicy_source: boolean
  total_records: number
  processed_records: number
  new_contacts: number
  merged_contacts: number
  skipped_records: number
  error_message: string | null
  created_at: string
  completed_at: string | null
}

export interface ImportStaging {
  id: number
  import_job_id: number
  source_platform: string
  source_id: string | null
  normalized_data: any
  suggested_match_contact_id: number | null
  match_confidence: number | null
  review_status: 'pending' | 'approved_new' | 'approved_merge' | 'skipped'
  merge_field_decisions: any
  final_contact_id: number | null
  reviewed_at: string | null
  created_at: string
}

export interface Notification {
  id: string
  type: 'reminder' | 'birthday' | 'event' | 'shared_contact' | 'import'
  title: string
  description: string
  link: string
  read: boolean
  created_at: string
}
