import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settings, preferences, users } from '@/lib/api'
import { toast } from 'sonner'

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: settings.get,
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, data }: { key: string; data: any }) => settings.update(key, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Settings updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function usePreferences() {
  return useQuery({
    queryKey: ['preferences'],
    queryFn: preferences.get,
  })
}

export function useUpdatePreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, data }: { key: string; data: any }) => preferences.update(key, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['preferences'] })
      toast.success('Preferences updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: users.list,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: users.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('User created')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => users.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('User updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeactivateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: users.deactivate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('User deactivated')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
