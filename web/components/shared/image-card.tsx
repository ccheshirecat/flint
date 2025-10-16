import { useState } from "react"
import { useTranslation } from "@/components/i18n-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { 
  MoreHorizontal, 
  FileText, 
  HardDrive, 
  Download, 
  Upload, 
  CheckCircle, 
  XCircle,
  Play,
  Square,
  Trash2
} from "lucide-react"
import { Image } from "@/lib/api"
import { TRANSITIONS, EFFECTS } from "@/lib/ui-constants"

interface ImageCardProps {
  image: Image
  onAction?: (action: string, imageId: string) => void
  onDelete?: (imageId: string) => void
}

export function ImageCard({ image, onAction, onDelete }: ImageCardProps) {
  const { t } = useTranslation()
  const [isDeleting, setIsDeleting] = useState(false)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "available":
        return (
          <Badge className="bg-primary text-primary-foreground">
            <CheckCircle className="mr-1 h-3 w-3" />
            {t('images.available')}
          </Badge>
        )
      case "uploading":
        return (
          <Badge className="bg-accent text-accent-foreground">
            <Upload className="mr-1 h-3 w-3" />
            {t('images.uploading')}
          </Badge>
        )
      case "downloading":
        return (
          <Badge className="bg-accent text-accent-foreground">
            <Download className="mr-1 h-3 w-3" />
            {t('images.downloading')}
          </Badge>
        )
      case "error":
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            {t('images.error')}
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "iso":
        return <FileText className="h-4 w-4" />
      case "template":
        return <HardDrive className="h-4 w-4" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  const formatSize = (bytes: number) => {
  if (bytes == null || isNaN(bytes) || bytes < 0) {
    return t('images.unknown')
  }
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  const handleDelete = async () => {
    if (!onDelete) return
    
    if (!confirm(t('images.confirmDelete').replace('{name}', image.name))) {
      return
    }
    
    setIsDeleting(true)
    try {
      await onDelete(image.id)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Card className={`${EFFECTS.shadow.sm} ${TRANSITIONS.normal}`}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-start gap-2 text-base font-semibold min-w-0 flex-1">
            {getTypeIcon(image.type)}
            <span className="break-words leading-tight">{image.name}</span>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleDelete()
            }}
            disabled={isDeleting}
            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            {isDeleting ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {getStatusBadge(image.status || "available")}
          <Badge variant="secondary">
            {image.type.toUpperCase()}
          </Badge>
        </div>
        
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-start">
            <span className="text-muted-foreground">{t('images.size')}</span>
            <span className="font-medium text-right">{formatSize(image.size_b)}</span>
          </div>
          
          {image.os_info && (
            <div className="flex justify-between items-start">
              <span className="text-muted-foreground">{t('images.os')}</span>
              <span className="font-medium text-right break-words max-w-[60%]">{image.os_info}</span>
            </div>
          )}
          
          <div className="flex justify-between items-start">
            <span className="text-muted-foreground">{t('images.path')}</span>
            <span className="font-mono text-xs text-right break-all max-w-[60%]">{image.path || `/var/lib/libvirt/images/${image.name}`}</span>
          </div>
          
          <div className="flex justify-between items-start">
            <span className="text-muted-foreground">{t('images.created')}</span>
            <span className="font-medium text-right">{image.created_at ? new Date(image.created_at).toLocaleDateString() : t('images.unknown')}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}