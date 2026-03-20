import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { importApi } from '@/lib/api'
import { toast } from 'sonner'

export function useImportJobs() {
  return useQuery({
    queryKey: ['import-jobs'],
    queryFn: importApi.jobs,
  })
}

export function useImportJob(id: number | null) {
  return useQuery({
    queryKey: ['import-job', id],
    queryFn: () => importApi.job(id!),
    enabled: !!id,
  })
}

export function useImportReview(jobId?: number) {
  return useQuery({
    queryKey: ['import-review', jobId],
    queryFn: () => importApi.review(jobId),
  })
}

export function useUploadImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: importApi.upload,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['import-jobs'] })
      toast.success('Import file uploaded')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSetImportDecision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => importApi.setDecision(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['import-review'] })
      toast.success('Decision saved')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useFinalizeImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: importApi.finalize,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['import-jobs'] })
      qc.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Import finalized')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useCancelImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: importApi.cancel,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['import-jobs'] })
      toast.success('Import cancelled')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
