"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { 
  Download, 
  CheckCircle, 
  Clock, 
  HardDrive, 
  Monitor,
  Loader2,
  ExternalLink,
  Zap
} from "lucide-react"

interface CloudImage {
  id: string
  name: string
  url: string
  checksum_url?: string
  size_gb: number
  type: string
  os: string
  version: string
  description: string
  architecture: string
  downloaded: boolean
}

interface ImageRepositoryProps {
  onImageSelect?: (image: CloudImage) => void
  showSelectButton?: boolean
}

export function ImageRepository({ onImageSelect, showSelectButton = false }: ImageRepositoryProps) {
  const [images, setImages] = useState<CloudImage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadingImages, setDownloadingImages] = useState<Set<string>>(new Set())
  const { toast } = useToast()

  useEffect(() => {
    fetchImages()
  }, [])

  const fetchImages = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/image-repository', {
        credentials: 'include'
      })
      
      if (!response.ok) {
        throw new Error(`Failed to fetch images: ${response.status}`)
      }
      
      const data = await response.json()
      setImages(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load images')
    } finally {
      setIsLoading(false)
    }
  }

  const downloadImage = async (imageId: string) => {
    try {
      setDownloadingImages(prev => new Set([...prev, imageId]))
      
      const response = await fetch(`/api/image-repository/${imageId}/download`, {
        method: 'POST',
        credentials: 'include'
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Download failed: ${response.status}`)
      }
      
      const result = await response.json()
      
      toast({
        title: "Download Started",
        description: result.message,
      })
      
      // Poll for download completion
      pollDownloadStatus(imageId)
      
    } catch (err) {
      toast({
        title: "Download Failed",
        description: err instanceof Error ? err.message : "Failed to start download",
        variant: "destructive",
      })
      setDownloadingImages(prev => {
        const newSet = new Set(prev)
        newSet.delete(imageId)
        return newSet
      })
    }
  }

  const pollDownloadStatus = async (imageId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/image-repository/${imageId}/status`, {
          credentials: 'include'
        })
        
        if (response.ok) {
          const status = await response.json()
          if (status.downloaded) {
            // Download completed
            clearInterval(pollInterval)
            setDownloadingImages(prev => {
              const newSet = new Set(prev)
              newSet.delete(imageId)
              return newSet
            })
            
            // Refresh images list
            fetchImages()
            
            toast({
              title: "Download Complete",
              description: `Image ${imageId} downloaded successfully`,
            })
          }
        }
      } catch (err) {
        console.error("Failed to check download status:", err)
      }
    }, 2000) // Poll every 2 seconds
    
    // Stop polling after 10 minutes
    setTimeout(() => {
      clearInterval(pollInterval)
      setDownloadingImages(prev => {
        const newSet = new Set(prev)
        newSet.delete(imageId)
        return newSet
      })
    }, 600000)
  }

  const getOSIcon = (os: string) => {
    switch (os.toLowerCase()) {
      case 'ubuntu':
        return '🐧'
      case 'debian':
        return '🌀'
      case 'centos':
        return '🔴'
      case 'fedora':
        return '🎩'
      case 'alpine':
        return '🏔️'
      default:
        return '💻'
    }
  }

  const groupedImages = images.reduce((acc, image) => {
    if (!acc[image.os]) {
      acc[image.os] = []
    }
    acc[image.os].push(image)
    return acc
  }, {} as Record<string, CloudImage[]>)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-red-500">
            <p>Error: {error}</p>
            <Button onClick={fetchImages} className="mt-4">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Cloud Image Repository</h2>
        <p className="text-muted-foreground">
          Download popular cloud images with one click. All images include cloud-init support.
        </p>
      </div>

      <Tabs defaultValue={Object.keys(groupedImages)[0]} className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          {Object.keys(groupedImages).map((os) => (
            <TabsTrigger key={os} value={os} className="flex items-center gap-2">
              <span>{getOSIcon(os)}</span>
              {os}
            </TabsTrigger>
          ))}
        </TabsList>

        {Object.entries(groupedImages).map(([os, osImages]) => (
          <TabsContent key={os} value={os} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {osImages.map((image) => {
                const isDownloading = downloadingImages.has(image.id)
                
                return (
                  <Card key={image.id} className="relative overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{getOSIcon(image.os)}</span>
                          <div>
                            <CardTitle className="text-lg">{image.name}</CardTitle>
                            <CardDescription>{image.version}</CardDescription>
                          </div>
                        </div>
                        
                        {image.downloaded ? (
                          <Badge className="bg-green-500 text-white">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Downloaded
                          </Badge>
                        ) : isDownloading ? (
                          <Badge variant="secondary">
                            <Clock className="mr-1 h-3 w-3" />
                            Downloading
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            Available
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        {image.description}
                      </p>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <HardDrive className="h-4 w-4" />
                          {image.size_gb} GB
                        </div>
                        <div className="flex items-center gap-1">
                          <Monitor className="h-4 w-4" />
                          {image.architecture}
                        </div>
                      </div>
                      
                      {isDownloading && (
                        <div className="space-y-2">
                          <Progress value={undefined} className="h-2" />
                          <p className="text-xs text-muted-foreground text-center">
                            Downloading and verifying...
                          </p>
                        </div>
                      )}
                      
                      <div className="flex gap-2">
                        {!image.downloaded && !isDownloading && (
                          <Button 
                            onClick={() => downloadImage(image.id)}
                            className="flex-1"
                            size="sm"
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </Button>
                        )}
                        
                        {showSelectButton && image.downloaded && onImageSelect && (
                          <Button 
                            onClick={() => onImageSelect(image)}
                            variant="outline"
                            className="flex-1"
                            size="sm"
                          >
                            <Zap className="mr-2 h-4 w-4" />
                            Use Image
                          </Button>
                        )}
                        
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => window.open(image.url, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}