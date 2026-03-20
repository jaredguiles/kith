import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { media, contacts as contactsApi } from '@/lib/api'
import { MediaAsset } from '@/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Trash2, Image as ImageIcon, Play } from 'lucide-react'

interface ContactMediaTabProps {
  contactId: number
}

export function ContactMediaTab({ contactId }: ContactMediaTabProps) {
  const qc = useQueryClient()
  const spicyMode = localStorage.getItem('kith_spicy') === 'true'

  const { data: mediaAssets = [] } = useQuery({
    queryKey: ['contact-media', contactId],
    queryFn: () => media.list({ contact_id: contactId.toString() }),
  })

  const setPhotoMutation = useMutation({
    mutationFn: (mediaId: number) => contactsApi.setPhoto(contactId, mediaId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', contactId] })
      toast.success('Profile photo updated')
    },
  })

  const deleteMediaMutation = useMutation({
    mutationFn: (id: number) => media.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-media', contactId] })
      toast.success('Media deleted')
    },
  })

  const [selectedMedia, setSelectedMedia] = useState<MediaAsset | null>(null)
  const [viewOpen, setViewOpen] = useState(false)

  // Filter spicy media if spicy mode is off
  const filteredMedia = mediaAssets.filter(m => spicyMode || !m.is_spicy)

  const handleSetAsProfile = (mediaAsset: MediaAsset) => {
    if (mediaAsset.is_profile_eligible) {
      setPhotoMutation.mutate(mediaAsset.id)
    } else {
      toast.error('This media cannot be used as a profile photo')
    }
  }

  const handleDelete = (id: number) => {
    if (confirm('Delete this media?')) {
      deleteMediaMutation.mutate(id)
    }
  }

  const handleViewMedia = (mediaAsset: MediaAsset) => {
    setSelectedMedia(mediaAsset)
    setViewOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <div className="p-4 rounded-lg border-2 border-dashed border-border dark:border-slate-700 text-center">
        <Plus className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium text-foreground mb-1">Add Photos & Videos</p>
        <p className="text-xs text-muted-foreground mb-3">Upload media to this contact</p>
        <Button variant="outline" size="sm" disabled>
          Upload (Coming Soon)
        </Button>
      </div>

      {/* Media Grid */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">
          Media ({filteredMedia.length})
        </h3>

        {filteredMedia.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No media added</p>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {filteredMedia.map(mediaAsset => (
              <div key={mediaAsset.id} className="group relative aspect-square rounded-lg overflow-hidden bg-muted dark:bg-slate-900">
                {mediaAsset.thumbnail_path || mediaAsset.file_path ? (
                  <>
                    <img
                      src={mediaAsset.thumbnail_path || mediaAsset.file_path}
                      alt={mediaAsset.caption || 'Media'}
                      className="w-full h-full object-cover cursor-pointer group-hover:brightness-75 transition-all"
                      onClick={() => handleViewMedia(mediaAsset)}
                    />
                    {mediaAsset.type === 'video' && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="h-8 w-8 text-white fill-white" />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}

                {/* Overlay Buttons */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  {mediaAsset.is_profile_eligible && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleSetAsProfile(mediaAsset)}
                      disabled={setPhotoMutation.isPending}
                      className="text-xs"
                    >
                      Set Profile
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="destructive"
                    onClick={() => handleDelete(mediaAsset.id)}
                    disabled={deleteMediaMutation.isPending}
                    className="h-8 w-8"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>

                {/* Caption Tooltip */}
                {mediaAsset.caption && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-xs text-white truncate">{mediaAsset.caption}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Media Viewer Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-2xl">
          {selectedMedia && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedMedia.caption || 'Media'}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                {selectedMedia.type === 'photo' || !selectedMedia.file_path.endsWith('.mp4') ? (
                  <img
                    src={selectedMedia.file_path}
                    alt={selectedMedia.caption || 'Media'}
                    className="w-full rounded-lg object-contain max-h-96"
                  />
                ) : (
                  <video
                    src={selectedMedia.file_path}
                    controls
                    className="w-full rounded-lg object-contain max-h-96"
                  />
                )}
                {selectedMedia.caption && (
                  <p className="text-sm text-muted-foreground">{selectedMedia.caption}</p>
                )}
                {selectedMedia.is_profile_eligible && (
                  <Button
                    onClick={() => {
                      handleSetAsProfile(selectedMedia)
                      setViewOpen(false)
                    }}
                    disabled={setPhotoMutation.isPending}
                  >
                    Set as Profile Photo
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
