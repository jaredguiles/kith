import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { events } from '@/lib/api'
import { toast } from 'sonner'

export function useEvents(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['events', params],
    queryFn: () => events.list(params),
  })
}

export function useEvent(id: number | null) {
  return useQuery({
    queryKey: ['event', id],
    queryFn: () => events.get(id!),
    enabled: !!id,
  })
}

export function useCreateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: events.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
      toast.success('Event created')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => events.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['events'] })
      qc.invalidateQueries({ queryKey: ['event', id] })
      toast.success('Event updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: events.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
      toast.success('Event deleted')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
