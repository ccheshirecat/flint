"use client"

import { useState, useEffect } from "react"
import { useTranslation } from "@/components/i18n-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { 
  Camera, 
  Play, 
  Loader2, 
  Clock,
  Cpu,
  MemoryStick,
  HardDrive,
} from "lucide-react"

interface VMTemplate {
  id: string
  name: string
  description: string
  sourceVM: string
  vcpus: number
  memory: number
  diskSize: number
  createdAt: string
  lastUsed?: string
}

interface VMTemplatesProps {
  onLaunchFromTemplate?: (templateId: string, vmName: string) => void
}

export function VMTemplates({ onLaunchFromTemplate }: VMTemplatesProps) {
  const { t } = useTranslation()
  const [templates, setTemplates] = useState<VMTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [newVMName, setNewVMName] = useState("")
  const [selectedTemplate, setSelectedTemplate] = useState<VMTemplate | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/vm-templates')
      if (response.ok) {
        const data = await response.json()
        setTemplates(data)
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLaunchFromTemplate = async () => {
    if (!selectedTemplate || !newVMName.trim()) return

    setIsCreating(true)
    try {
      const response = await fetch('/api/vms/from-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          name: newVMName,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create VM from template')
      }

      const newVM = await response.json()
      
      toast({
        title: t('vm.vmCreatedFromTemplate'),
        description: `${newVMName} ${t('vm.isStartingUpFrom')} ${selectedTemplate.name}`,
      })

      onLaunchFromTemplate?.(selectedTemplate.id, newVMName)
      setSelectedTemplate(null)
      setNewVMName("")
    } catch (error) {
      toast({
        title: t('vm.creationFailed'),
        description: error instanceof Error ? error.message : t('vm.failedToCreateVM'),
        variant: "destructive",
      })
    } finally {
      setIsCreating(false)
    }
  }

  const formatMemory = (mb: number) => {
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${mb}MB`
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>{t('vm.loadingTemplates')}...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!templates || templates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            {t('vm.vmTemplates')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <Camera className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2">{t('vm.noTemplatesAvailable')}</p>
            <p className="text-sm text-muted-foreground">
              {t('vm.createVMThenSnapshot')}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          {t('vm.quickLaunchTemplates')}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('vm.launchVMsInstantly')}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {(templates || []).map((template) => (
          <div
            key={template.id}
            className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold mb-1">{template.name}</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  {template.description}
                </p>
                
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Cpu className="h-3 w-3" />
                    {template.vcpus} vCPU
                  </div>
                  <div className="flex items-center gap-1">
                    <MemoryStick className="h-3 w-3" />
                    {formatMemory(template.memory)}
                  </div>
                  <div className="flex items-center gap-1">
                    <HardDrive className="h-3 w-3" />
                    {template.diskSize}GB
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(template.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button 
                    size="sm"
                    onClick={() => setSelectedTemplate(template)}
                  >
                    <Play className="mr-1 h-3 w-3" />
                    {t('vm.launch')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('vm.launchVMFromTemplate')}</DialogTitle>
                    <DialogDescription>
                      {t('vm.createNewVMBasedOn')} "{template.name}" {t('vm.template')}
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="vm-name">{t('vm.vmName')}</Label>
                      <Input
                        id="vm-name"
                        placeholder={t('vm.vmNamePlaceholder2')}
                        value={newVMName}
                        onChange={(e) => setNewVMName(e.target.value)}
                      />
                    </div>
                    
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm font-medium mb-2">{t('vm.templateConfiguration')}:</p>
                      <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                        <span>vCPUs: {template.vcpus}</span>
                        <span>{t('vm.memory')}: {formatMemory(template.memory)}</span>
                        <span>{t('vm.disk')}: {template.diskSize}GB</span>
                        <span>{t('vm.source')}: {template.sourceVM}</span>
                      </div>
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button
                      onClick={handleLaunchFromTemplate}
                      disabled={!newVMName.trim() || isCreating}
                    >
                      {isCreating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t('vm.creating')}...
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-4 w-4" />
                          {t('vm.launchVM')}
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}