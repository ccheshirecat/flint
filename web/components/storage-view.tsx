"use client"

import { useState, useEffect } from "react"
import { useTranslation } from "@/components/i18n-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { HardDrive, Plus, Activity, PowerOff, AlertTriangle, Construction, Loader2, Edit, Trash2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { StoragePool, Volume, storageAPI, hostAPI } from "@/lib/api"
import { SPACING, TYPOGRAPHY, GRIDS, TRANSITIONS, COLORS } from "@/lib/ui-constants"
import { ConsistentButton } from "@/components/ui/consistent-button"
import { ErrorState } from "@/components/ui/error-state"

// Define the Pool type based on our API contract
interface Pool {
  name: string;
  state: "Active" | "Inactive" | "Building" | "Degraded" | "Inaccessible" | "Unknown";
  capacity_b: number;
  allocation_b: number;
}

// Create a dedicated component for rendering the status badge
const PoolStatusBadge = ({ state, t }: { state: Pool['state'], t: (key: string) => string }) => {
  switch (state) {
    case "Active":
      return (
        <Badge className="bg-primary text-primary-foreground">
          <Activity className="mr-1 h-3 w-3" />
          {t('vm.active')}
        </Badge>
      );
    case "Inactive":
      return (
        <Badge variant="secondary">
          <PowerOff className="mr-1 h-3 w-3" />
          {t('vm.inactive')}
        </Badge>
      );
    case "Building":
      return (
        <Badge variant="outline" className="text-blue-500 border-blue-500">
          <Construction className="mr-1 h-3 w-3" />
          {t('vm.building')}
        </Badge>
      );
    case "Degraded":
    case "Inaccessible":
      return (
        <Badge variant="destructive">
          <AlertTriangle className="mr-1 h-3 w-3" />
          {state}
        </Badge>
      );
    default:
      return <Badge variant="outline">{t('vm.unknown')}</Badge>;
  }
};

export function StorageView() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [storagePools, setStoragePools] = useState<StoragePool[]>([])
  const [volumes, setVolumes] = useState<Volume[]>([])
  const [selectedPool, setSelectedPool] = useState<StoragePool | null>(null)
  const [activeTab, setActiveTab] = useState("pools")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hostResources, setHostResources] = useState<any>(null)
  const [isCreateVolumeDialogOpen, setIsCreateVolumeDialogOpen] = useState(false)
  const [newVolumeName, setNewVolumeName] = useState("")
  const [newVolumeSize, setNewVolumeSize] = useState(10) // Default to 10GB
  const [isCreatingVolume, setIsCreatingVolume] = useState(false)
  const [editingVolume, setEditingVolume] = useState<Volume | null>(null)
  const [editVolumeSize, setEditVolumeSize] = useState(0)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

  useEffect(() => {
    const fetchStorageData = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        const [pools, resources] = await Promise.all([
          storageAPI.getPools(),
          hostAPI.getResources()
        ])
        setStoragePools(pools)
        setHostResources(resources)

        if (pools && pools.length > 0) {
          const firstPool = pools[0]
          if (firstPool && firstPool.name) {
            setSelectedPool(firstPool)
            // Only fetch volumes if we have a valid pool name
            try {
              const poolVolumes = await storageAPI.getVolumes(firstPool.name)
              setVolumes(poolVolumes)
            } catch (err) {
              console.error("Failed to load volumes for first pool:", err)
              setVolumes([])
            }
          } else {
            setSelectedPool(null)
            setVolumes([])
          }
        } else {
          setSelectedPool(null)
          setVolumes([])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load storage data")
        // Don't reset storage data on error - keep existing data
      } finally {
        setIsLoading(false)
      }
    }

    fetchStorageData()
  }, [])

  const handlePoolSelect = async (pool: StoragePool) => {
    if (!pool || !pool.name) {
      console.error("Invalid pool selected:", pool)
      return
    }
    
    setSelectedPool(pool)
    setVolumes([]) // Clear volumes immediately
    
    try {
      const poolVolumes = await storageAPI.getVolumes(pool.name)
      setVolumes(poolVolumes)
    } catch (err) {
      console.error("Failed to load volumes for pool:", pool.name, err)
      setVolumes([])
    }
  }

  const formatSize = (bytes: number) => {
    const gb = bytes / 1024 / 1024 / 1024
    if (gb >= 1024) {
      return `${(gb / 1024).toFixed(1)}TB`
    }
    return `${gb.toFixed(1)}GB`
  }

  const handleCreateVolume = async () => {
    if (!selectedPool?.name) return
    
    try {
      setIsCreatingVolume(true)
      const newVolume = await storageAPI.createVolume(selectedPool!.name, {
        Name: newVolumeName,
        SizeGB: newVolumeSize,
      })
      
      // Refresh volumes list with proper error handling
      try {
        const updatedVolumes = await storageAPI.getVolumes(selectedPool.name)
        setVolumes(updatedVolumes || [])
      } catch (volumeErr) {
        console.warn('Failed to refresh volumes after creation:', volumeErr)
        // Don't show error since volume was created successfully
        setVolumes(prevVolumes => [...prevVolumes, {
          name: newVolumeName,
          path: `${selectedPool!.name}/${newVolumeName}`,
          capacity_b: newVolumeSize * 1024 * 1024 * 1024
        }])
      }
      
      // Close dialog and reset form
      setIsCreateVolumeDialogOpen(false)
      setNewVolumeName("")
      setNewVolumeSize(10)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create volume")
    } finally {
      setIsCreatingVolume(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>{t('vm.loadingStorageData')}</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`${SPACING.section} ${SPACING.page}`}>
        <ErrorState 
          title={t('vm.errorLoadingStorage')}
          description={error}
        />
      </div>
    )
  }

  return (
    <div className={`${SPACING.section} ${SPACING.page}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className={TYPOGRAPHY.pageTitle}>{t('storage.title')}</h1>
          <p className="text-muted-foreground">{t('storage.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <ConsistentButton 
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                icon={<Plus className="h-4 w-4" />}
              >
                {t('storage.createPool')}
              </ConsistentButton>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('storage.createPool')}</DialogTitle>
                <DialogDescription>
                  {t('storage.createPoolDescription')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pool-name">{t('vm.poolName')}</Label>
                  <Input id="pool-name" placeholder="e.g., vm-storage" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pool-path">{t('vm.storagePath')}</Label>
                  <Input id="pool-path" placeholder="/var/lib/libvirt/images" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pool-type">{t('vm.poolType')}</Label>
                  <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="dir">{t('storage.directory')}</option>
                    <option value="fs">{t('storage.filesystem')}</option>
                    <option value="netfs">{t('storage.networkFilesystem')}</option>
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">{t('storage.createPool')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Storage Overview Cards */}
      <div className={`${GRIDS.fourCol} ${SPACING.grid}`}>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('vm.totalPools')}</p>
                <p className="text-2xl font-bold">{storagePools.length}</p>
              </div>
              <HardDrive className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('vm.activePools')}</p>
                <p className="text-2xl font-bold text-primary">
                  {(storagePools || []).filter((pool) => pool.allocation_b > 0).length}
                </p>
              </div>
              <Activity className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('vm.totalCapacity')}</p>
                <p className="text-2xl font-bold">
                  {hostResources ? formatSize(hostResources.storage_total_b) : formatSize(storagePools.reduce((acc, pool) => acc + pool.capacity_b, 0))}
                </p>
              </div>
              <HardDrive className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('vm.totalVolumes')}</p>
                <p className="text-2xl font-bold">{volumes.length}</p>
              </div>
              <HardDrive className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mt-4">
          <TabsTrigger value="pools">{t('storage.pools')}</TabsTrigger>
          <TabsTrigger value="volumes">{t('vm.allVolumes')}</TabsTrigger>
        </TabsList>

        <TabsContent value="pools" className="space-y-6 mt-6">
          <div className={`grid gap-6 lg:grid-cols-3`}>
            {/* Storage Pools List */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center justify-between">
                    {t('storage.pools')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pb-4">
                  {(storagePools || []).map((pool) => (
                    <div
                      key={pool.name}
                      className={`cursor-pointer rounded-lg border p-3 transition-colors hover:bg-muted/50 ${
                        selectedPool?.name === pool.name ? "border-primary bg-primary/5" : ""
                      }`}
                      onClick={() => handlePoolSelect(pool)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{pool.name}</p>
                          <p className="text-xs text-muted-foreground">{t('vm.storagePool')}</p>
                        </div>
                        <PoolStatusBadge state="Active" t={t} />
                      </div>
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{formatSize(pool.allocation_b)} {t('vm.used')}</span>
                          <span>{formatSize(pool.capacity_b)} {t('vm.total')}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                          <div
                            className="bg-primary h-1 rounded-full"
                            style={{ width: `${(pool.allocation_b / pool.capacity_b) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Selected Pool Details */}
            <div className="lg:col-span-2">
              {selectedPool?.name && (
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center justify-between">
                      {selectedPool.name}
                      <div className="flex gap-2">
                        <Dialog open={isCreateVolumeDialogOpen} onOpenChange={setIsCreateVolumeDialogOpen}>
                          <DialogTrigger asChild>
                            <ConsistentButton 
                              size="sm"
                              icon={<Plus className="h-4 w-4" />}
                            >
                              {t('storage.createVolume')}
                            </ConsistentButton>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                              <DialogTitle>{t('vm.createNewVolume')}</DialogTitle>
                              <DialogDescription>
                                Create a new storage volume in the {selectedPool.name} pool.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                              <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="name" className="text-right">
                                  {t('common.name')}
                                </Label>
                                <Input
                                  id="name"
                                  value={newVolumeName}
                                  onChange={(e) => setNewVolumeName(e.target.value)}
                                  className="col-span-3"
                                  placeholder="e.g., my-disk"
                                />
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="size" className="text-right">
                                  {t('vm.sizeGB')}
                                </Label>
                                <Input
                                  id="size"
                                  type="number"
                                  min="1"
                                  value={newVolumeSize}
                                  onChange={(e) => setNewVolumeSize(Number(e.target.value))}
                                  className="col-span-3"
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button 
                                type="submit" 
                                onClick={handleCreateVolume}
                                disabled={isCreatingVolume || !newVolumeName}
                              >
                                {isCreatingVolume ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t('vm.creating')}
                                  </>
                                ) : (
                                  t('storage.createVolume')
                                )}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5 pb-4">
                    {/* Pool Information */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{t('vm.type')}</p>
                        <p className="font-semibold">{t('vm.storagePool')}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{t('vm.status')}</p>
                        <PoolStatusBadge state="Active" t={t} />
                      </div>
                      <div className="col-span-2">
                        <p className="text-sm font-medium text-muted-foreground">{t('common.name')}</p>
                        <p className="font-mono text-sm">{selectedPool.name}</p>
                      </div>
                    </div>

                    {/* Storage Usage */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t('vm.storageUsage')}</span>
                        <span className="font-medium">
                          {formatSize(selectedPool.allocation_b)} / {formatSize(selectedPool.capacity_b)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full"
                          style={{ width: `${(selectedPool.allocation_b / selectedPool.capacity_b) * 100}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{formatSize(selectedPool.capacity_b - selectedPool.allocation_b)} {t('vm.available')}</span>
                        <span>{((selectedPool.allocation_b / selectedPool.capacity_b) * 100).toFixed(1)}% {t('vm.used')}</span>
                      </div>
                    </div>

                    {/* Volumes in Pool */}
                    <div>
                      <h3 className="font-medium mb-2">Volumes ({volumes.length})</h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('common.name')}</TableHead>
                            <TableHead>{t('vm.format')}</TableHead>
                            <TableHead>{t('vm.capacity')}</TableHead>
                            <TableHead>{t('vm.allocation')}</TableHead>
                            <TableHead>{t('vm.usedBy')}</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(volumes || []).map((volume) => (
                            <TableRow key={volume.name}>
                              <TableCell className="font-medium">{volume.name}</TableCell>
                              <TableCell>qcow2</TableCell>
                              <TableCell>{formatSize(volume.capacity_b)}</TableCell>
                              <TableCell>{formatSize(volume.capacity_b)}</TableCell>
                              <TableCell>
                                <span className="text-muted-foreground">{t('vm.unknown')}</span>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="hover:bg-muted"
                                    onClick={() => {
                                      setEditingVolume(volume)
                                      setEditVolumeSize(Math.round(volume.capacity_b / (1024 * 1024 * 1024)))
                                      setIsEditDialogOpen(true)
                                    }}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={async () => {
                                      if (!selectedPool?.name) {
                                        toast({
                                          title: "Error",
                                          description: "No storage pool selected",
                                          variant: "destructive",
                                        })
                                        return
                                      }
                                      
                                      if (confirm(`Are you sure you want to delete volume "${volume.name}"?`)) {
                                        try {
                                          const response = await fetch(`/api/storage-pools/${selectedPool!.name}/volumes/${volume.name}`, {
                                            method: 'DELETE',
                                          })
                                          if (!response.ok) {
                                            throw new Error('Failed to delete volume')
                                          }
                                          const updatedVolumes = await storageAPI.getVolumes(selectedPool!.name)
                                          setVolumes(updatedVolumes)
                                          toast({
                                            title: "Success",
                                            description: `Volume "${volume.name}" deleted successfully`,
                                          })
                                        } catch (err) {
                                          toast({
                                            title: "Delete Failed",
                                            description: err instanceof Error ? err.message : "Failed to delete volume",
                                            variant: "destructive",
                                          })
                                        }
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
