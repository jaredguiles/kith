import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tags } from '@/lib/api'
import { toast } from 'sonner'

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: tags.list,
  })
}

export function useCreateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: tags.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] })
      toast.success('Tag created')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => tags.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] })
      toast.success('Tag updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: tags.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] })
      toast.success('Tag deleted')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAddTagToContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tagId, contactId }: { tagId: number; contactId: number }) =>
      tags.addToContact(tagId, contactId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] })
      qc.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Tag added to contact')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useRemoveTagFromContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tagId, contactId }: { tagId: number; contactId: number }) =>
      tags.removeFromContact(tagId, contactId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] })
      qc.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Tag removed from contact')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
