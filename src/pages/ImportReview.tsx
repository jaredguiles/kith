import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useImportReview, useImportJob, useSetImportDecision, useFinalizeImport } from '@/hooks/useImport'
import { useContacts } from '@/hooks/useContacts'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Avatar } from '@/components/shared/Avatar'
import { EmptyState } from '@/components/shared/EmptyState'
import { ImportStaging } from '@/types'
import { formatDate } from '@/lib/utils'
import { CheckCircle2, XCircle, Plus } from 'lucide-react'
import { toast } from 'sonner'

export default function ImportReview() {
  const navigate = useNavigate()
  const { jobId: jobIdParam } = useParams()
  const jobId = jobIdParam ? parseInt(jobIdParam) : null

  // Fetch import data
  const { data: reviewData = [], isLoading } = useImportReview(jobId || undefined)
  const { data: jobData } = useImportJob(jobId)
  const { data: contactsData } = useContacts()
  const contactsList = contactsData?.contacts || []

  const setDecision = useSetImportDecision()
  const finalizeImport = useFinalizeImport()

  // Local state for decisions
  const [decisions, setDecisions] = useState<Record<number, { action: 'create' | 'merge' | 'skip'; mergeContactId?: number }>>({})
  const [showConflicts, setShowConflicts] = useState<number | null>(null)

  const records = reviewData as ImportStaging[]
  const decisionedRecords = useMemo(() => {
    return records.map((record) => ({
      record,
      decision: decisions[record.id],
    }))
  }, [records, decisions])

  const allDecisioned = records.every((r) => decisions[r.id])
  const pendingCount = records.filter((r) => !decisions[r.id]).length
  const approvedCount = Object.values(decisions).filter((d) => d && d.action !== 'skip').length

  const handleDecision = (recordId: number, action: 'create' | 'merge' | 'skip', mergeContactId?: number) => {
    setDecisions((prev) => ({
      ...prev,
      [recordId]: { action, mergeContactId },
    }))
    setDecision.mutate({ id: recordId, data: { action, merge_contact_id: mergeContactId } })
  }

  const handleApproveAll = () => {
    records.forEach((record) => {
      if (!decisions[record.id]) {
        if (record.suggested_match_contact_id && record.match_confidence && record.match_confidence >= 0.5) {
          handleDecision(record.id, 'merge', record.suggested_match_contact_id)
        } else {
          handleDecision(record.id, 'create')
        }
      }
    })
  }

  const handleSkipAll = () => {
    records.forEach((record) => {
      if (!decisions[record.id]) {
        handleDecision(record.id, 'skip')
      }
    })
  }

  const handleFinalize = () => {
    if (!jobId) return
    if (confirm('Finalize import? This will create/merge all approved contacts.')) {
      finalizeImport.mutate(jobId, {
        onSuccess: () => {
          toast.success('Import completed successfully')
          navigate('/contacts')
        },
      })
    }
  }

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading import records...</div>
  }

  if (!records || records.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Import Review</h1>
        <EmptyState
          icon="Upload"
          title="No imports to review"
          description="No import jobs awaiting review"
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Import Review</h1>
        <p className="text-muted-foreground mt-2">Review and finalize imported contacts</p>
      </div>

      {/* Job Info */}
      {jobData && (
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Source</p>
              <p className="font-semibold capitalize">{jobData.source_platform}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Date</p>
              <p className="font-semibold">{formatDate(jobData.created_at)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Records</p>
              <p className="font-semibold">{jobData.total_records}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="font-semibold capitalize text-blue-500">{jobData.status}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Progress</p>
              <p className="font-semibold">{approvedCount}/{records.length}</p>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant="outline"
          onClick={handleApproveAll}
          disabled={pendingCount === 0}
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Approve All Suggested
        </Button>
        <Button
          variant="outline"
          onClick={handleSkipAll}
          disabled={pendingCount === 0}
        >
          <XCircle className="h-4 w-4 mr-2" />
          Skip All Pending
        </Button>
        <Button
          onClick={handleFinalize}
          disabled={!allDecisioned || finalizeImport.isPending}
          className="ml-auto"
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Finalize Import
        </Button>
      </div>

      {/* Records List */}
      <div className="space-y-3">
        {decisionedRecords.map(({ record, decision }) => (
          <ImportRecord
            key={record.id}
            record={record}
            decision={decision}
            availableContacts={contactsList}
            onDecision={handleDecision}
            onShowConflicts={() => setShowConflicts(record.id)}
            isLoading={setDecision.isPending}
          />
        ))}
      </div>

      {/* Conflict View Dialog */}
      {showConflicts && (
        <Dialog open={!!showConflicts} onOpenChange={(open) => !open && setShowConflicts(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Review Field Conflicts</DialogTitle>
            </DialogHeader>
            <ConflictViewer record={records.find((r) => r.id === showConflicts)!} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

interface ImportRecordProps {
  record: ImportStaging
  decision?: { action: 'create' | 'merge' | 'skip'; mergeContactId?: number }
  availableContacts: any[]
  onDecision: (recordId: number, action: 'create' | 'merge' | 'skip', mergeContactId?: number) => void
  onShowConflicts: () => void
  isLoading: boolean
}

function ImportRecord({
  record,
  decision,
  availableContacts,
  onDecision,
  onShowConflicts,
  isLoading,
}: ImportRecordProps) {
  const [searchContact, setSearchContact] = useState('')
  const [isMergeOpen, setIsMergeOpen] = useState(false)

  const normalized = record.normalized_data || {}
  const hasConflicts = record.merge_field_decisions && Object.keys(record.merge_field_decisions).length > 0

  const suggestedContact = availableContacts.find((c) => c.id === record.suggested_match_contact_id)
  const selectedMergeContact = availableContacts.find((c) => c.id === decision?.mergeContactId)

  const filteredContacts = availableContacts.filter((c) =>
    c.display_name.toLowerCase().includes(searchContact.toLowerCase())
  )

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Left: Imported Preview */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-muted-foreground">Imported Profile</p>
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium">{normalized.display_name || 'No name'}</p>
              <p className="text-xs text-muted-foreground">{normalized.platform || record.source_platform}</p>
            </div>
            {normalized.location && (
              <p className="text-xs text-muted-foreground">📍 {normalized.location}</p>
            )}
            {normalized.bio && (
              <p className="text-xs text-foreground line-clamp-2">{normalized.bio}</p>
            )}
          </div>
        </div>

        {/* Right: Decision Options */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-muted-foreground">Decision</p>
          <div className="space-y-2">
            {/* Create as new */}
            <label className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
              <input
                type="radio"
                checked={decision?.action === 'create'}
                onChange={() => onDecision(record.id, 'create')}
                disabled={isLoading}
              />
              <span className="text-sm">Create as new contact</span>
            </label>

            {/* Merge */}
            <div>
              <label className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
                <input
                  type="radio"
                  checked={decision?.action === 'merge'}
                  onChange={() => setIsMergeOpen(true)}
                  disabled={isLoading}
                />
                <span className="text-sm">Merge into:</span>
              </label>

              {decision?.action === 'merge' && (
                <div className="ml-6 mt-2 p-2 bg-muted rounded">
                  {selectedMergeContact ? (
                    <div className="flex items-center gap-2">
                      <Avatar contact={selectedMergeContact} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{selectedMergeContact.display_name}</p>
                        {selectedMergeContact.location && (
                          <p className="text-xs text-muted-foreground">{selectedMergeContact.location}</p>
                        )}
                      </div>
                      {hasConflicts && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={onShowConflicts}
                          className="text-xs"
                        >
                          Review Conflicts
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Popover open={isMergeOpen} onOpenChange={setIsMergeOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full justify-start">
                          <Plus className="h-3 w-3 mr-1" />
                          Select contact...
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-0" align="start">
                        <Command>
                          <CommandInput
                            placeholder="Search contacts..."
                            value={searchContact}
                            onValueChange={setSearchContact}
                          />
                          {filteredContacts.length === 0 ? (
                            <CommandEmpty>No contacts found</CommandEmpty>
                          ) : (
                            <CommandGroup>
                              {filteredContacts.map((contact) => (
                                <CommandItem
                                  key={contact.id}
                                  onSelect={() => {
                                    onDecision(record.id, 'merge', contact.id)
                                    setIsMergeOpen(false)
                                  }}
                                >
                                  <Avatar contact={contact} size="sm" />
                                  <span className="ml-2">{contact.display_name}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              )}

              {record.match_confidence && record.match_confidence >= 0.5 && suggestedContact && (
                <p className="text-xs text-muted-foreground mt-1">
                  Suggested ({Math.round(record.match_confidence * 100)}% confidence)
                </p>
              )}
            </div>

            {/* Skip */}
            <label className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
              <input
                type="radio"
                checked={decision?.action === 'skip'}
                onChange={() => onDecision(record.id, 'skip')}
                disabled={isLoading}
              />
              <span className="text-sm">Skip/dismiss</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

function ConflictViewer({ record }: { record: ImportStaging }) {
  const conflicts = record.merge_field_decisions || {}
  const normalized = record.normalized_data || {}

  if (!conflicts || Object.keys(conflicts).length === 0) {
    return <p className="text-muted-foreground">No conflicts detected</p>
  }

  return (
    <div className="space-y-4">
      {Object.entries(conflicts).map(([field, decision]: [string, any]) => (
        <div key={field} className="border border-border rounded-lg p-3 space-y-2">
          <p className="font-semibold text-sm">{field}</p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-2 bg-red-500/10 rounded">
              <p className="text-muted-foreground">Imported</p>
              <p className="font-mono text-foreground">{normalized[field] || '—'}</p>
            </div>
            <div className="p-2 bg-green-500/10 rounded">
              <p className="text-muted-foreground">Selected</p>
              <p className="font-mono text-foreground">{decision?.selected_value || '—'}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
