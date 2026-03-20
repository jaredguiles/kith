import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | null): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(date: string | null): string {
  if (!date) return ''
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function daysUntilBirthday(birthday: string): number {
  const today = new Date()
  const bday = new Date(birthday)
  bday.setFullYear(today.getFullYear())
  if (bday < today) bday.setFullYear(today.getFullYear() + 1)
  return Math.ceil((bday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export const PRIDE_FLAGS: Record<string, string[]> = {
  Gay: ['#E40303', '#FF8C00', '#FFED00', '#008026', '#004Dff', '#750787'],
  Lesbian: ['#D52D00', '#EF7627', '#FF9A56', '#FFFFFF', '#D162A4', '#B55690', '#A30262'],
  Bisexual: ['#D60270', '#D60270', '#9B4F96', '#0038A8', '#0038A8'],
  Pansexual: ['#FF218C', '#FFD800', '#21B1FF'],
  Transgender: ['#5BCEFA', '#F5A9B8', '#FFFFFF', '#F5A9B8', '#5BCEFA'],
  'Non-binary': ['#FCF434', '#FFFFFF', '#9C59D1', '#2C2C2C'],
  Asexual: ['#000000', '#A3A3A3', '#FFFFFF', '#800080'],
  Queer: ['#E40303', '#FF8C00', '#FFED00', '#008026', '#004Dff', '#750787'],
}

export const PLATFORMS = [
  'Instagram',
  'Twitter/X',
  'LinkedIn',
  'Facebook',
  'TikTok',
  'Snapchat',
  'YouTube',
  'GitHub',
  'Sniffies',
  'Grindr',
  'Scruff',
  'Feeld',
  'Hinge',
  'Tinder',
  'Bumble',
  'Website',
  'Other',
]

export const RELATIONSHIP_TYPES = ['Friend', 'Family', 'Coworker', 'Acquaintance', 'Neighbor', 'Other']

export const RELATIONSHIP_STATUSES = [
  'Single',
  'In a relationship',
  'Married',
  'Engaged',
  'Divorced',
  'Widowed',
  'Separated',
  "It's complicated",
  'Open relationship',
  'Domestic partnership',
]

export const EVENT_TYPES = ['meetup', 'date', 'hangout', 'hookup', 'party', 'trip', 'call', 'dinner', 'coffee', 'workout', 'other']
