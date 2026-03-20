import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groups } from '@/lib/api'
import { toast } from 'sonner'

export function useGroups() {
  return useQuery({
    queryKey: ['groups'],
    queryFn: groups.list,
  })
}

export function useCreateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: groups.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Group created')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => groups.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Group updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: groups.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Group deleted')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAddGroupMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, contactId }: { groupId: number; contactId: number }) =>
      groups.addMember(groupId, contactId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Member added to group')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useRemoveGroupMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, contactId }: { groupId: number; contactId: number }) =>
      groups.removeMember(groupId, contactId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Member removed from group')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
