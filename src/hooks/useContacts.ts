import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contacts } from '@/lib/api'
import { toast } from 'sonner'

export function useContacts(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['contacts', params],
    queryFn: () => contacts.list(params),
  })
}

export function useContact(id: number | null) {
  return useQuery({
    queryKey: ['contact', id],
    queryFn: () => contacts.get(id!),
    enabled: !!id,
  })
}

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: contacts.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Contact created')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => contacts.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      qc.invalidateQueries({ queryKey: ['contact', id] })
      toast.success('Contact updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: contacts.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Contact deleted')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useToggleFavorite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: contacts.toggleFavorite,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
    },
  })
}

export function useMergeContacts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, otherId, decisions }: { id: number; otherId: number; decisions: any }) =>
      contacts.merge(id, otherId, decisions),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Contacts merged')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
