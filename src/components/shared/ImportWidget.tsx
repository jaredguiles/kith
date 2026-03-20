import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { importApi } from '@/lib/api'
import type { ImportJob } from '@/types'

export function ImportWidget() {
  const [activeJobs, setActiveJobs] = useState<ImportJob[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        setLoading(true)
        const jobs = await importApi.jobs()
        const pending = jobs.filter((j) => j.status === 'queued' || j.status === 'processing' || j.status === 'awaiting_review')
        setActiveJobs(pending)
      } catch (error) {
        console.error('Failed to fetch import jobs:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchJobs()

    const interval = setInterval(fetchJobs, 5000)
    return () => clearInterval(interval)
  }, [])

  if (activeJobs.length === 0) {
    return null
  }

  const job = activeJobs[0]
  const progress = Math.round((job.processed_records / Math.max(job.total_records, 1)) * 100)
  const statusText = {
    queued: 'Queued',
    processing: 'Processing',
    awaiting_review: 'Awaiting Review',
    complete: 'Complete',
    error: 'Error',
  }[job.status] || 'Unknown'

  return (
    <div className="fixed bottom-6 right-6 w-80 bg-neutral-950 border border-neutral-700 rounded-lg shadow-lg p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-sm font-semibold text-neutral-50">{job.source_platform} Import</h4>
          <p className="text-xs text-neutral-400 mt-1">{statusText}</p>
        </div>
        <button
          onClick={() => setActiveJobs([])}
          className="text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mb-3">
        <Progress value={progress} max={100} />
        <p className="text-xs text-neutral-400 mt-2">
          {job.processed_records} / {job.total_records} records
        </p>
      </div>

      <div className="text-xs text-neutral-400 space-y-1 mb-3">
        {job.new_contacts > 0 && <p>New contacts: {job.new_contacts}</p>}
        {job.merged_contacts > 0 && <p>Merged: {job.merged_contacts}</p>}
        {job.skipped_records > 0 && <p>Skipped: {job.skipped_records}</p>}
      </div>

      {job.status === 'awaiting_review' && (
        <a
          href={`/import-review?job_id=${job.id}`}
          className="block w-full bg-neutral-700 hover:bg-neutral-600 text-neutral-50 text-center py-2 rounded text-sm font-medium transition-colors"
        >
          Review Now
        </a>
      )}

      {job.error_message && <p className="text-xs text-red-400 mt-2">{job.error_message}</p>}
    </div>
  )
}
