"use client"

import { useState, useEffect } from "react"
import { useTranslation } from "@/components/i18n-provider"
import { navigateTo, routes, getUrlParams } from "@/lib/navigation"
import { useToast } from "@/hooks/use-toast"
import dynamic from "next/dynamic"


// Lazy load the serial console component to reduce initial bundle size
const VMSerialConsole = dynamic(() => import("@/components/vm-serial-console").then(mod => mod.VMSerialConsole), {
  loading: () => (
    <div className="flex items-center justify-center h-96">
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span>Loading console...</span>
      </div>
    </div>
  )
})

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { VMDetailed, vmAPI } from "@/lib/api"
import { VMNetworkInterfaceDialog } from "@/components/vm-network-interface-dialog"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Play,
  Square,
  RotateCcw,
  Monitor,
  Trash2,
  Activity,
  Clock,
  ArrowLeft,
  Camera,
  Plus,
  Edit,
  Loader2,
  Server,
  Key,
  Copy,
} from "lucide-react"

// Helper function to format uptime from seconds
const formatUptime = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
};

export default function VMDetailView() {
  const { t } = useTranslation()
  const searchParams = getUrlParams()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("overview")
  const [vmData, setVmData] = useState<VMDetailed | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [guestAgentStatus, setGuestAgentStatus] = useState<{ available: boolean; vm_uuid: string } | null>(null)
  const [isInstallingAgent, setIsInstallingAgent] = useState(false)
  const [isPerformingAction, setIsPerformingAction] = useState(false)
  const [isCreateSnapshotOpen, setIsCreateSnapshotOpen] = useState(false)
  const [snapshotName, setSnapshotName] = useState("")
  const [snapshotDescription, setSnapshotDescription] = useState("")
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false)
  const [isAddDiskOpen, setIsAddDiskOpen] = useState(false)
  const [diskVolumePath, setDiskVolumePath] = useState("")
  const [diskTargetDev, setDiskTargetDev] = useState("")
  const [isAttachingDisk, setIsAttachingDisk] = useState(false)
  const [isAddNetworkOpen, setIsAddNetworkOpen] = useState(false)
  const [networkName, setNetworkName] = useState("")
  const [networkModel, setNetworkModel] = useState("virtio")
  const [isAttachingNetwork, setIsAttachingNetwork] = useState(false)

  useEffect(() => {
    const fetchVMData = async () => {
      const vmId = searchParams.get('id')

      if (!vmId) {
        setError("No VM ID provided")
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        const [data, agentStatus] = await Promise.all([
          vmAPI.getById(vmId),
          vmAPI.getGuestAgentStatus(vmId).catch(() => ({ available: false, vm_uuid: vmId }))
        ])
        setVmData(data)
        setGuestAgentStatus(agentStatus)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load VM data")
      } finally {
        setIsLoading(false)
      }
    }

    fetchVMData()
  }, [])

  useEffect(() => {
    if (vmData?.uuid) {
      fetch(`/api/vms/${vmData.uuid}/snapshots`)
        .then(res => res.json())
        .then(data => setSnapshots(data))
        .catch(err => console.error("Failed to fetch snapshots:", err));
    }
  }, [vmData?.uuid])

  const performVMAction = async (action: string) => {
    if (!vmData?.uuid) return

    setIsPerformingAction(true)
    try {
      const response = await fetch(`/api/vms/${vmData.uuid}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to ${action} VM (HTTP ${response.status})`);
      }

      // Refresh VM data
      const updatedVM = await vmAPI.getById(vmData.uuid)
      setVmData(updatedVM)

      toast({
        title: "Success",
        description: `VM ${action} operation completed successfully`,
      })
    } catch (err) {
      console.error('VM action failed:', err)
      toast({
        title: "Error",
        description: `Failed to ${action} VM: ${err instanceof Error ? err.message : 'Unknown error'}`,
        variant: "destructive",
      })
    } finally {
      setIsPerformingAction(false)
    }
  }

  const handleCreateSnapshot = async () => {
    if (!snapshotName.trim() || !vmData) return

    setIsCreatingSnapshot(true)
    try {
      const response = await fetch(`/api/vms/${vmData.uuid}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: snapshotName,
          description: snapshotDescription,
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create snapshot')
      }

      // Refresh snapshots
      const snapshotsResponse = await fetch(`/api/vms/${vmData.uuid}/snapshots`)
      const updatedSnapshots = await snapshotsResponse.json()
      setSnapshots(updatedSnapshots)

      // Reset form
      setSnapshotName("")
      setSnapshotDescription("")
      setIsCreateSnapshotOpen(false)

      toast({
        title: "Success",
        description: `Snapshot "${snapshotName}" created successfully`,
      })
    } catch (err) {
      console.error('Snapshot creation failed:', err)
      toast({
        title: "Error",
        description: `Failed to create snapshot: ${err instanceof Error ? err.message : 'Unknown error'}`,
        variant: "destructive",
      })
    } finally {
      setIsCreatingSnapshot(false)
    }
  }

  const handleDeleteSnapshot = async (snapshotName: string) => {
    if (!vmData || !confirm(`Are you sure you want to permanently delete the snapshot '${snapshotName}'?`)) {
      return
    }

    try {
      const response = await fetch(`/api/vms/${vmData.uuid}/snapshots/${snapshotName}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete snapshot')
      }

      // Refresh snapshots
      const snapshotsResponse = await fetch(`/api/vms/${vmData.uuid}/snapshots`)
      const updatedSnapshots = await snapshotsResponse.json()
      setSnapshots(updatedSnapshots)

      toast({
        title: "Success",
        description: `Snapshot "${snapshotName}" deleted successfully`,
      })
    } catch (err) {
      console.error('Snapshot deletion failed:', err)
      toast({
        title: "Error",
        description: `Failed to delete snapshot: ${err instanceof Error ? err.message : 'Unknown error'}`,
        variant: "destructive",
      })
    }
  }

  const handleAttachDisk = async () => {
    if (!vmData?.uuid || !diskVolumePath || !diskTargetDev) return

    try {
      setIsAttachingDisk(true)
      const response = await fetch(`/api/vms/${vmData.uuid}/attach-disk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          volumePath: diskVolumePath,
          targetDev: diskTargetDev
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to attach disk')
      }

      // Refresh VM data
      const updatedVM = await vmAPI.getById(vmData.uuid)
      setVmData(updatedVM)

      // Close dialog and reset form
      setIsAddDiskOpen(false)
      setDiskVolumePath("")
      setDiskTargetDev("")

      toast({
        title: "Success",
        description: `Disk attached successfully as ${diskTargetDev}`,
      })
    } catch (err) {
      console.error('Disk attachment failed:', err)
      toast({
        title: "Error",
        description: `Failed to attach disk: ${err instanceof Error ? err.message : 'Unknown error'}`,
        variant: "destructive",
      })
    } finally {
      setIsAttachingDisk(false)
    }
  }

  const handleAttachNetwork = async () => {
    if (!vmData?.uuid || !networkName || !networkModel) return

    try {
      setIsAttachingNetwork(true)
      const response = await fetch(`/api/vms/${vmData.uuid}/attach-network`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          networkName: networkName,
          model: networkModel
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to attach network interface')
      }

      // Refresh VM data
      const updatedVM = await vmAPI.getById(vmData.uuid)
      setVmData(updatedVM)

      // Close dialog and reset form
      setIsAddNetworkOpen(false)
      setNetworkName("")
      setNetworkModel("virtio")

      toast({
        title: "Success",
        description: `Network interface attached successfully`,
      })
    } catch (err) {
      console.error('Network attachment failed:', err)
      toast({
        title: "Error",
        description: `Failed to attach network interface: ${err instanceof Error ? err.message : 'Unknown error'}`,
        variant: "destructive",
      })
    } finally {
      setIsAttachingNetwork(false)
    }
  }

  const handleRevertSnapshot = async (snapshotName: string) => {
    if (!vmData || !confirm(`This will revert the VM to the state of '${snapshotName}'. All changes made since that time will be lost. The VM must be stopped to perform this action. Continue?`)) {
      return
    }

    setIsPerformingAction(true)
    try {
      const response = await fetch(`/api/vms/${vmData.uuid}/snapshots/${snapshotName}/revert`, {
        method: 'POST'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to revert snapshot')
      }

      // Refresh VM data
      const updatedVM = await vmAPI.getById(vmData.uuid)
      setVmData(updatedVM)

      toast({
        title: "Success",
        description: `VM reverted to snapshot "${snapshotName}" successfully`,
      })
    } catch (err) {
      console.error('Snapshot revert failed:', err)
      toast({
        title: "Error",
        description: `Failed to revert snapshot: ${err instanceof Error ? err.message : 'Unknown error'}`,
        variant: "destructive",
      })
    } finally {
      setIsPerformingAction(false)
    }
  }

  if (isLoading) {
    return (
      <div className="${SPACING.section} ${SPACING.page}">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>

        {/* Tabs skeleton */}
        <Skeleton className="h-10 w-full" />

        {/* Content skeleton */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <Skeleton className="h-6 w-32" />
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
          <div className="space-y-4">
            <Skeleton className="h-6 w-32" />
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !vmData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">{t('vm.errorLoadingVM')}</h2>
          <p className="text-muted-foreground">{error || t('vm.vmNotFound')}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigateTo(routes.vms)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('vm.backToVMs')}
          </Button>
        </div>
      </div>
    )
  }

  const memoryUsagePercent = vmData.max_memory_kb > 0 ? (vmData.memory_kb / vmData.max_memory_kb) * 100 : 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return (
          <Badge className="bg-green-500 hover:bg-green-600 text-white">
            <Activity className="mr-1 h-3 w-3" />
            {t('vm.running')}
          </Badge>
        )
      case "shutoff":
        return (
          <Badge className="bg-red-500 hover:bg-red-600 text-white">
            <Square className="mr-1 h-3 w-3" />
            {t('vm.stopped')}
          </Badge>
        )
      case "paused":
        return (
          <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white">
            <Clock className="mr-1 h-3 w-3" />
            {t('vm.paused')}
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const formatMemory = (kb: number) => {
    const mb = kb / 1024
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)}GB`
    }
    return `${Math.round(mb)}MB`
  }

  const copySSHCommand = () => {
    if (!vmData.ip_addresses || vmData.ip_addresses.length === 0) {
      toast({
        title: "No IP Address",
        description: "VM doesn't have an IP address yet. Wait for cloud-init to complete.",
        variant: "destructive",
      })
      return
    }

    const ip = vmData.ip_addresses[0]
    const username = "ubuntu" // Default from cloud-init
    const command = `ssh ubuntu@${ip}`
    
    navigator.clipboard.writeText(command).then(() => {
      toast({
        title: "SSH Command Copied!",
        description: `Copied: ${command}`,
      })
    }).catch(() => {
      // Fallback for browsers without clipboard API
      const textarea = document.createElement('textarea')
      textarea.value = command
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      
      toast({
        title: "SSH Command Copied!",
        description: `Copied: ${command}`,
      })
    })
  }

  return (
    <div className="space-y-6 p-6 pt-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigateTo(routes.vms)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('vm.backToVMs')}
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{vmData.name}</h1>
              {getStatusBadge(vmData.state)}
            </div>
            <p className="text-sm text-muted-foreground mt-1">UUID: {vmData.uuid}</p>
          </div>
        </div>

        <div className="flex gap-2">
          {vmData.state === "Running" ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => performVMAction('stop')}
                disabled={isPerformingAction}
                aria-label={`Stop virtual machine ${vmData.name}`}
              >
                {isPerformingAction ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Square className="mr-2 h-4 w-4" />
                )}
                {t('vm.stop')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => performVMAction('reboot')}
                disabled={isPerformingAction}
                aria-label={`Reboot virtual machine ${vmData.name}`}
              >
                {isPerformingAction ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                {t('vm.restart')}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => performVMAction('start')}
              disabled={isPerformingAction}
              aria-label={`Start virtual machine ${vmData.name}`}
            >
              {isPerformingAction ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {t('vm.start')}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Check if console endpoint exists first
              fetch(`/api/vms/${vmData.uuid}/serial-console`)
                .then(response => {
                  if (response.ok) {
                    navigateTo(routes.vmConsole(vmData.uuid))
                  } else {
                    toast({
                      title: t('vm.consoleNotAvailable'),
                      description: t('vm.consoleNotAvailableDesc'),
                      variant: "destructive",
                    })
                  }
                })
                .catch(() => {
                  toast({
                    title: "Error",
                    description: "Failed to check console availability. The VM might not be running.",
                    variant: "destructive",
                  })
                })
            }}
            aria-label={`Open serial console for ${vmData.name}`}
          >
            <Monitor className="mr-2 h-4 w-4" />
            {t('vm.serialConsole')}
          </Button>
          {vmData.ip_addresses && vmData.ip_addresses.length > 0 && (
            <Button
              variant="default"
              size="sm"
              onClick={copySSHCommand}
              className="bg-green-500 hover:bg-green-600 text-white"
            >
              <Server className="mr-2 h-4 w-4" />
              SSH
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            aria-label={`Delete virtual machine ${vmData.name}`}
            onClick={async () => {
              if (confirm(`Are you sure you want to permanently delete the virtual machine "${vmData.name}"? This action cannot be undone.`)) {
                try {
                  const response = await fetch(`/api/vms/${vmData.uuid}`, {
                    method: 'DELETE',
                  })

                  if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || `Failed to delete VM (HTTP ${response.status})`);
                  }

                  toast({
                    title: "Success",
                    description: `VM "${vmData.name}" deleted successfully`,
                  })

                  // Redirect to VM list
                  navigateTo(routes.vms)
                } catch (error) {
                  console.error('Failed to delete VM:', error)
                  toast({
                    title: "Error",
                    description: `Failed to delete VM: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    variant: "destructive",
                  })
                }
              }
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t('vm.delete')}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5 mt-2">
          <TabsTrigger value="overview">{t('vm.overview')}</TabsTrigger>
          <TabsTrigger value="storage">{t('vm.storage')}</TabsTrigger>
          <TabsTrigger value="networking">{t('vm.networking')}</TabsTrigger>
          <TabsTrigger value="console">{t('vm.console')}</TabsTrigger>
          <TabsTrigger value="snapshots">{t('vm.snapshots')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Configuration */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>
                  {t('vm.configuration')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pb-4">
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <p className="text-sm font-medium text-muted-foreground">{t('vm.cpu_cores')}</p>
                     <p className="text-lg font-bold">{vmData.vcpus}</p>
                   </div>
                   <div>
                     <p className="text-sm font-medium text-muted-foreground">{t('vm.memory')}</p>
                     <p className="text-lg font-semibold">{formatMemory(vmData.memory_kb)}</p>
                   </div>
                   <div>
                     <p className="text-sm font-medium text-muted-foreground">{t('vm.operatingSystem')}</p>
                     <p className="text-lg font-semibold">{vmData.os_info || vmData.os || "Unknown"}</p>
                   </div>
                   <div>
                     <p className="text-sm font-medium text-muted-foreground">{t('vm.state')}</p>
                     <div className="mt-1">{getStatusBadge(vmData.state)}</div>
                   </div>
                 </div>
                <Separator />
                 <div className="space-y-2">
                   <div className="flex justify-between text-sm">
                     <span className="text-muted-foreground">{t('vm.uptime')}</span>
                     <span>{formatUptime(vmData.uptime_sec)}</span>
                   </div>
                   <div className="flex justify-between text-sm">
                     <span className="text-muted-foreground">{t('common.cpuUsage')}</span>
                     <span>{vmData.cpu_percent ? vmData.cpu_percent.toFixed(1) : 0}%</span>
                   </div>
                 </div>
              </CardContent>
            </Card>

            {/* Current Usage */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>{t('vm.currentUsage')}</CardTitle>
              </CardHeader>
               <CardContent className="space-y-4 pb-4">
                 <div className="space-y-2">
                   <div className="flex justify-between text-sm">
                     <span className="text-muted-foreground">{t('common.cpuUsage')}</span>
                     <span className="font-medium">{vmData.cpu_percent ? vmData.cpu_percent.toFixed(1) : 0}%</span>
                   </div>
                   <Progress value={vmData.cpu_percent} className="h-2" />
                 </div>
                 <div className="space-y-2">
                   <div className="flex justify-between text-sm">
                     <span className="text-muted-foreground">{t('vm.memory')}</span>
                     <span className="font-medium">{formatMemory(vmData.memory_kb)}</span>
                   </div>
                    <Progress value={memoryUsagePercent} className="h-2" />
                 </div>
                 <Separator />
                 <div className="grid grid-cols-2 gap-4 text-center">
                   <div>
                     <p className="text-2xl font-bold text-primary">{vmData.cpu_percent ? vmData.cpu_percent.toFixed(1) : 0}%</p>
                     <p className="text-xs text-muted-foreground">{t('vm.cpuLoad')}</p>
                   </div>
                   <div>
                     <p className="text-2xl font-bold text-primary">{vmData.vcpus}</p>
                     <p className="text-xs text-muted-foreground">{t('vm.cpu_cores')}</p>
                   </div>
                 </div>
                </CardContent>
            </Card>
          </div>
        </TabsContent>



        <TabsContent value="storage" className="space-y-6 mt-4">
          <Card>
            <CardHeader className="pb-3">
               <CardTitle className="flex items-center justify-between">
                 {t('vm.storageDevices')}
                 <Dialog open={isAddDiskOpen} onOpenChange={setIsAddDiskOpen}>
                   <DialogTrigger asChild>
                     <Button size="sm">
                       <Plus className="mr-2 h-4 w-4" />
                       {t('vm.addDisk')}
                     </Button>
                   </DialogTrigger>
                   <DialogContent className="sm:max-w-[425px]">
                     <DialogHeader>
                       <DialogTitle>{t('vm.addDiskToVM')}</DialogTitle>
                       <DialogDescription>
                         {t('vm.attachStorageVolume')}
                       </DialogDescription>
                     </DialogHeader>
                     <div className="grid gap-4 py-4">
                       <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="volume-path" className="text-right">
                           {t('vm.volumePath')}
                         </Label>
                         <Input
                           id="volume-path"
                           value={diskVolumePath}
                           onChange={(e) => setDiskVolumePath(e.target.value)}
                           className="col-span-3"
                           placeholder="/var/lib/libvirt/images/disk.qcow2"
                         />
                       </div>
                       <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="target-dev" className="text-right">
                           {t('vm.targetDevice')}
                         </Label>
                         <Input
                           id="target-dev"
                           value={diskTargetDev}
                           onChange={(e) => setDiskTargetDev(e.target.value)}
                           className="col-span-3"
                           placeholder="vdb"
                         />
                       </div>
                     </div>
                     <DialogFooter>
                       <Button
                         type="submit"
                         onClick={handleAttachDisk}
                         disabled={isAttachingDisk || !diskVolumePath || !diskTargetDev}
                       >
                         {isAttachingDisk ? (
                           <>
                             <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                             {t('vm.attaching')}
                           </>
                         ) : (
                           t('vm.attachDisk')
                         )}
                       </Button>
                     </DialogFooter>
                   </DialogContent>
                 </Dialog>
               </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">{t('vm.device')}</TableHead>
                    <TableHead className="px-4">{t('common.type')}</TableHead>
                    <TableHead className="px-4">{t('common.size')}</TableHead>
                    <TableHead className="px-4">{t('vm.used')}</TableHead>
                    <TableHead className="px-4">{t('vm.format')}</TableHead>
                    <TableHead className="px-4">{t('vm.storagePool')}</TableHead>
                    <TableHead className="px-4"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(vmData.disks || []).map((device, index) => (
                     <TableRow key={index} className="hover:bg-muted/50">
                       <TableCell className="font-mono px-4">{device.device}</TableCell>
                       <TableCell className="px-4">{t('vm.disk')}</TableCell>
                       <TableCell className="px-4">N/A</TableCell>
                       <TableCell className="px-4">N/A</TableCell>
                       <TableCell className="px-4">N/A</TableCell>
                       <TableCell className="px-4">N/A</TableCell>
                      <TableCell className="px-4">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            toast({
                              title: t('vm.featureNotAvailable'),
                              description: t('vm.diskRemovalFuture'),
                              variant: "default",
                            })
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="networking" className="space-y-6 mt-4">
          <Card>
            <CardHeader className="pb-3">
               <CardTitle className="flex items-center justify-between">
                 {t('vm.networkInterfaces')}
                 <Button 
                   size="sm"
                   onClick={() => setIsAddNetworkOpen(true)}
                 >
                   <Plus className="mr-2 h-4 w-4" />
                   {t('vm.addNetworkInterface')}
                 </Button>
               </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">{t('networking.interface')}</TableHead>
                    <TableHead className="px-4">{t('common.type')}</TableHead>
                    <TableHead className="px-4">{t('vm.network')}</TableHead>
                    <TableHead className="px-4">{t('vm.macAddress')}</TableHead>
                    <TableHead className="px-4">{t('vm.ipAddress')}</TableHead>
                    <TableHead className="px-4">{t('common.status')}</TableHead>
                    <TableHead className="px-4"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(vmData.nics || []).map((iface, index) => (
                     <TableRow key={index} className="hover:bg-muted/50">
                       <TableCell className="font-mono px-4">eth{index}</TableCell>
                       <TableCell className="px-4">{iface.model}</TableCell>
                       <TableCell className="px-4">{iface.source}</TableCell>
                       <TableCell className="font-mono px-4">{iface.mac}</TableCell>
                       <TableCell className="font-mono px-4">N/A</TableCell>
                       <TableCell className="px-4">
                         <Badge className="bg-green-500 hover:bg-green-600 text-white">{t('vm.active')}</Badge>
                       </TableCell>
                      <TableCell className="px-4">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            toast({
                              title: t('vm.featureNotAvailable'),
                              description: t('vm.diskRemovalFuture'),
                              variant: "default",
                            })
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="console" className="space-y-6 mt-4">
          <VMSerialConsole vmUuid={vmData.uuid} />
        </TabsContent>

        <TabsContent value="snapshots" className="space-y-6 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                {t('vm.vmSnapshots')}
                <Button
                  size="sm"
                  onClick={() => setIsCreateSnapshotOpen(true)}
                  disabled={vmData.state !== "shutoff"}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t('vm.createSnapshot')}
                </Button>
              </CardTitle>
              <CardDescription>
                {t('vm.createSnapshotDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-4">
              {vmData.state !== "shutoff" && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-sm text-yellow-800">
                    ⚠️ 只有在虚拟机停止时才能创建快照。当前状态：{vmData.state}
                  </p>
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">{t('common.name')}</TableHead>
                    <TableHead className="px-4">{t('common.description')}</TableHead>
                    <TableHead className="px-4">{t('vm.createdAt')}</TableHead>
                    <TableHead className="px-4 w-24">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshots.map((snapshot) => (
                    <TableRow key={snapshot.name} className="hover:bg-muted/50">
                      <TableCell className="font-medium px-4">{snapshot.name}</TableCell>
                      <TableCell className="px-4">{snapshot.description || t('common.noDescription')}</TableCell>
                      <TableCell className="text-sm text-muted-foreground px-4">
                        {new Date(snapshot.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="px-4">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRevertSnapshot(snapshot.name)}
                            disabled={vmData.state !== "shutoff"}
                            title={vmData.state !== "shutoff" ? "虚拟机必须停止才能恢复" : "恢复到此快照"}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteSnapshot(snapshot.name)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            title={t('vm.deleteSnapshot')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {snapshots.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Camera className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>未找到快照</p>
                  <p className="text-sm">创建您的第一个快照以保存当前状态</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Snapshot Modal */}
      <Dialog open={isCreateSnapshotOpen} onOpenChange={setIsCreateSnapshotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('vm.createSnapshot')}</DialogTitle>
            <DialogDescription>
              {t('vm.createSnapshotDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="snapshot-name">{t('vm.snapshotName')} *</Label>
              <Input
                id="snapshot-name"
                placeholder="例如：升级前"
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="snapshot-description">{t('vm.snapshotDescription')}</Label>
              <Textarea
                id="snapshot-description"
                placeholder="可选的快照描述..."
                value={snapshotDescription}
                onChange={(e) => setSnapshotDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateSnapshotOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCreateSnapshot}
              disabled={!snapshotName.trim() || isCreatingSnapshot}
            >
              {isCreatingSnapshot ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  创建中...
                </>
              ) : (
                t('vm.createSnapshot')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enhanced Network Interface Dialog */}
      <VMNetworkInterfaceDialog
        open={isAddNetworkOpen}
        onOpenChange={setIsAddNetworkOpen}
        vmUuid={vmData?.uuid || ""}
        onSuccess={async () => {
          if (vmData?.uuid) {
            const updatedVM = await vmAPI.getById(vmData.uuid)
            setVmData(updatedVM)
          }
        }}
      />
    </div>
  )
}
