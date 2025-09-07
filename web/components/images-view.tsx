"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Download,
  Upload,
  FileText,
  HardDrive,
  Loader2,
  CheckCircle,
  XCircle,
  ImageIcon,
} from "lucide-react"
import { Image, imageAPI } from "@/lib/api"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { ImageCard } from "@/components/shared/image-card"
import { SPACING, TYPOGRAPHY, GRIDS, TRANSITIONS } from "@/lib/ui-constants"
import { ConsistentButton } from "@/components/ui/consistent-button"
import { ErrorState } from "@/components/ui/error-state"

export function ImagesView() {
  const [images, setImages] = useState<Image[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [importPath, setImportPath] = useState("")
  const [downloadUrl, setDownloadUrl] = useState("")
  const [isImporting, setIsImporting] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  useEffect(() => {
    const fetchImages = async () => {
      try {
        setIsLoading(true)
        const images = await imageAPI.getAll()
        setImages(images)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load images")
        // Don't reset images on error - keep existing data
      } finally {
        setIsLoading(false)
      }
    }

    fetchImages()
  }, [])

  const filteredImages = (images || []).filter((image) => {
    const matchesSearch =
      image.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (image.os_info && image.os_info.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesType = typeFilter === "all" || image.type === typeFilter
    return matchesSearch && matchesType
  })

  const formatSize = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "available":
        return (
          <Badge className="bg-primary text-primary-foreground">
            <CheckCircle className="mr-1 h-3 w-3" />
            Available
          </Badge>
        )
      case "uploading":
        return (
          <Badge className="bg-accent text-accent-foreground">
            <Upload className="mr-1 h-3 w-3" />
            Uploading
          </Badge>
        )
      case "downloading":
        return (
          <Badge className="bg-accent text-accent-foreground">
            <Download className="mr-1 h-3 w-3" />
            Downloading
          </Badge>
        )
      case "error":
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            Error
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

  const handleFileUpload = async (file: File) => {
    setIsUploading(true)
    setUploadProgress(0)

    try {
      await imageAPI.upload(file)
      setIsAddDialogOpen(false)
      // Refresh images list
      const updatedImages = await imageAPI.getAll()
      setImages(updatedImages)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload image")
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const handleImageAction = async (action: string, imageId: string) => {
    try {
      switch (action) {
        case "download":
          // Implement download logic
          console.log("Download image", imageId)
          break
        default:
          console.warn("Unknown action:", action)
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to perform action")
    }
  }

  const handleDeleteImage = async (imageId: string) => {
    if (!confirm("Are you sure you want to delete this image? This action cannot be undone.")) {
      return
    }
    
    try {
      await imageAPI.delete(imageId)
      // Refresh images list
      const updatedImages = await imageAPI.getAll()
      setImages(updatedImages)
      
      // Show success message
      console.log(`Image ${imageId} deleted successfully`)
    } catch (error) {
      console.error("Failed to delete image:", error)
      setError(error instanceof Error ? error.message : "Failed to delete image")
    }
  }

  if (isLoading) {
    return <LoadingState title="Loading images" description="Please wait while we fetch your image library" />
  }

  if (error) {
    return (
      <ErrorState 
        title="Error Loading Images"
        description={error}
      />
    )
  }

  return (
    <div className={SPACING.section}>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className={TYPOGRAPHY.sectionTitle}>My Images</h2>
          <p className="text-muted-foreground">Manage your uploaded images and templates</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <ConsistentButton icon={<Plus className="h-4 w-4" />}>
              Add Image
            </ConsistentButton>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Image</DialogTitle>
              <DialogDescription>
                Import an existing image or upload a new one to your library.
              </DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="upload" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="upload">Upload File</TabsTrigger>
                <TabsTrigger value="import">Import from Host</TabsTrigger>
                <TabsTrigger value="download">Download URL</TabsTrigger>
              </TabsList>
              <TabsContent value="upload" className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select File</label>
                  <Input
                    type="file"
                    accept=".iso,.qcow2,.img"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleFileUpload(file)
                    }}
                    disabled={isUploading}
                  />
                  {isUploading && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Uploading...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <Progress value={uploadProgress} />
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="import" className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Host Path</label>
                  <Input
                    placeholder="/path/to/image.iso"
                    value={importPath}
                    onChange={(e) => setImportPath(e.target.value)}
                    disabled={isImporting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the absolute path to an image file on the host system.
                  </p>
                </div>
                <Button
                  className="w-full"
                  onClick={async () => {
                    if (!importPath.trim()) return
                    setIsImporting(true)
                    try {
                      await imageAPI.importFromPath({ path: importPath })
                      setIsAddDialogOpen(false)
                      setImportPath("")
                      // Refresh images list
                      const updatedImages = await imageAPI.getAll()
                      setImages(updatedImages)
                    } catch (error) {
                      setError(error instanceof Error ? error.message : "Failed to import image")
                    } finally {
                      setIsImporting(false)
                    }
                  }}
                  disabled={!importPath.trim() || isImporting}
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    "Import Image"
                  )}
                </Button>
              </TabsContent>
              <TabsContent value="download" className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Download URL</label>
                  <Input
                    placeholder="https://example.com/image.iso"
                    value={downloadUrl}
                    onChange={(e) => setDownloadUrl(e.target.value)}
                    disabled={isDownloading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter a URL to download an image file from.
                  </p>
                </div>
                <Button
                  className="w-full"
                  onClick={async () => {
                    if (!downloadUrl.trim()) return
                    setIsDownloading(true)
                    try {
                      await imageAPI.download({ url: downloadUrl })
                      setIsAddDialogOpen(false)
                      setDownloadUrl("")
                      // Refresh images list
                      const updatedImages = await imageAPI.getAll()
                      setImages(updatedImages)
                    } catch (error) {
                      setError(error instanceof Error ? error.message : "Failed to download image")
                    } finally {
                      setIsDownloading(false)
                    }
                  }}
                  disabled={!downloadUrl.trim() || isDownloading}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    "Download Image"
                  )}
                </Button>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>
      
      {/* Toolbar */}
      <Card className="mt-2">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search images by name or OS..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-32">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="iso">ISOs</SelectItem>
                  <SelectItem value="template">Templates</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Image Grid */}
      {filteredImages.length > 0 ? (
        <div className={`${GRIDS.threeCol} ${SPACING.grid} mt-2`}>
          {filteredImages.map((image) => (
            <ImageCard
              key={image.id}
              image={image}
              onAction={handleImageAction}
              onDelete={handleDeleteImage}
            />
          ))}
        </div>
      ) : (
        <div className="mt-2">
          <EmptyState
            title="No Images Found"
            description={searchQuery ? "No images match your search criteria" : "Get started by adding your first image"}
            icon={<ImageIcon className="h-8 w-8 text-muted-foreground" />}
            action={
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Image
                  </Button>
                </DialogTrigger>
                {/* Dialog content is already defined above */}
              </Dialog>
            }
          />
        </div>
      )}
    </div>
  )
}