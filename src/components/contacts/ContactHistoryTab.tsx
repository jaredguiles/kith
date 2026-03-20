import { useQuery } from '@tanstack/react-query'
import { contacts } from '@/lib/api'
import { FieldChange } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatDateTime } from '@/lib/utils'
import { History } from 'lucide-react'

interface ContactHistoryTabProps {
  contactId: number
}

export function ContactHistoryTab({ contactId }: ContactHistoryTabProps) {
  const { data: changelog = [], isLoading } = useQuery({
    queryKey: ['contact-changelog', contactId],
    queryFn: () => contacts.changelog(contactId),
  })

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading history...</div>
  }

  if (changelog.length === 0) {
    return <div className="text-sm text-muted-foreground text-center py-8">No changes recorded</div>
  }

  // Group by date
  const groupedByDate = changelog.reduce((acc, entry) => {
    const date = formatDateTime(entry.changed_at).split(',')[0]
    if (!acc[date]) acc[date] = []
    acc[date].push(entry)
    return acc
  }, {} as Record<string, FieldChange[]>)

  return (
    <div className="space-y-6">
      {Object.entries(groupedByDate).map(([date, entries]) => (
        <div key={date}>
          <div className="sticky top-0 bg-background dark:bg-slate-950 py-2 z-10">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{date}</h3>
          </div>
          <div className="space-y-3 ml-4 border-l border-border dark:border-slate-800 pl-4">
            {entries.map((entry, idx) => (
              <div key={idx} className="relative">
                <div className="absolute -left-6 top-2 w-3 h-3 rounded-full bg-primary" />
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {formatFieldName(entry.field_name)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(entry.changed_at).split(',')[1]}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">
                      {formatValue(entry.old_value)}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-foreground font-medium">
                      {formatValue(entry.new_value)}
                    </span>
                  </div>
                  {entry.source && (
                    <p className="text-xs text-muted-foreground">
                      Source: <Badge variant="outline" className="text-xs">{entry.source}</Badge>
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Separator className="dark:bg-slate-800 mt-4" />
        </div>
      ))}
    </div>
  )
}

function formatFieldName(fieldName: string): string {
  return fieldName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatValue(value: string | null): string {
  if (value === null || value === '') return '(empty)'
  if (value === 'true') return 'Yes'
  if (value === 'false') return 'No'
  return value
}
