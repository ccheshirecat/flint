"use client"

import React, { useState, useEffect } from "react"
import { useTranslation } from "@/components/i18n-provider"
import { navigateTo, routes } from "@/lib/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { VMSummary, vmAPI } from "@/lib/api"
import { useToast } from "@/components/ui/use-toast"
import {
  Plus,
  Search,
  Filter,
  Play,
  Square,
  RotateCcw,
  Monitor,
  Trash2,
  Activity,
  Clock,
  ArrowUpDown,
  Eye,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { SPACING, TYPOGRAPHY, GRIDS, TRANSITIONS, COLORS } from "@/lib/ui-constants"
import { ConsistentButton } from "@/components/ui/consistent-button"
import { ErrorState } from "@/components/ui/error-state"

export function VirtualMachineListView() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [selectedVMs, setSelectedVMs] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortBy, setSortBy] = useState("name")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")
  const [virtualMachines, setVirtualMachines] = useState<VMSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchVMs = async () => {
      try {
        setIsLoading(true)
        const vms = await vmAPI.getAll()
        setVirtualMachines(vms)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load VMs")
      } finally {
        setIsLoading(false)
      }
    }

    fetchVMs()
  }, [])

  const filteredVMs = virtualMachines.filter((vm) => {
    const matchesSearch =
      vm.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vm.uuid.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "all" || vm.state === statusFilter
    return matchesSearch && matchesStatus
  })

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedVMs(filteredVMs.map((vm) => vm.uuid))
    } else {
      setSelectedVMs([])
    }
  }

  const handleSelectVM = (vmId: string, checked: boolean) => {
    if (checked) {
      setSelectedVMs([...selectedVMs, vmId])
    } else {
      setSelectedVMs(selectedVMs.filter((id) => id !== vmId))
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "Running":
        return t('vm.running')
      case "Shutoff":
        return t('vm.stopped')
      case "Paused":
        return t('vm.paused')
      default:
        return status
    }
  }

  const getStatusBadge = (status: string) => {
    let variant = "default"
    let color = "primary"
    let icon = Activity

    switch (status) {
      case "Running":
        variant = "default"
        color = "primary"
        icon = Activity
        break
      case "Shutoff":
        variant = "destructive"
        color = "destructive"
        icon = Square
        break
      case "Paused":
        variant = "secondary"
        color = "accent"
        icon = Clock
        break
      default:
        variant = "secondary"
        color = "muted"
        icon = Activity
        break
    }

    return (
      <Badge variant="outline" className={cn(
        "text-xs font-medium px-2.5 py-1 rounded-full shadow-sm transition-all duration-200 hover:shadow-md inline-flex items-center gap-1",
        status === "Running" ? "bg-green-500 text-white border-green-500/20" : "",
        status === "Shutoff" ? "bg-red-500 text-white border-red-500/20" : "",
        status === "Paused" ? "bg-yellow-500 text-white border-yellow-500/20" : ""
      )}>
        {React.createElement(icon, { className: "h-3 w-3" })}
        <span className="hidden sm:inline">{getStatusText(status)}</span>
      </Badge>
    )
  }

  const formatMemory = (kb: number) => {
    const mb = kb / 1024
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)}GB`
    }
    return `${Math.round(mb)}MB`
  }

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
  }

  const handleVMAction = async (uuid: string, action: "start" | "stop" | "reboot") => {
    try {
      // Show loading state
      toast({
        title: "Processing...",
        description: `Performing ${action} action on VM...`,
      })

      const response = await fetch(`/api/vms/${uuid}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to ${action} VM (HTTP ${response.status})`);
      }

      // Show success message first
      toast({
        title: "Success",
        description: `VM ${action} action completed successfully`,
      })

      // Wait a moment for the backend state to update, then refresh
      setTimeout(async () => {
        try {
          const updatedVMs = await vmAPI.getAll()
          setVirtualMachines(updatedVMs)
        } catch (err) {
          console.error("Failed to refresh VM list:", err)
        }
      }, 1000)
      
      // Also refresh immediately in case the state is already updated
      const immediateVMs = await vmAPI.getAll()
      setVirtualMachines(immediateVMs)
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to perform VM action",
        variant: "destructive",
      })
    }
  }

  const handleDeleteVM = async (uuid: string) => {
    try {
      // Show loading state
      toast({
        title: "Processing...",
        description: "Deleting VM...",
      })

      await vmAPI.delete(uuid)
      
      // Refresh the VM list
      const updatedVMs = await vmAPI.getAll()
      setVirtualMachines(updatedVMs)
      
      // Remove from selected VMs if it was selected
      setSelectedVMs(selectedVMs.filter(id => id !== uuid))
      
      // Show success message
      toast({
        title: "Success",
        description: "VM deleted successfully",
      })
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to delete VM",
        variant: "destructive",
      })
    }
  }

  const handleCreateVM = () => {
    navigateTo(routes.vmCreate)
  }

  const sortedVMs = [...filteredVMs].sort((a, b) => {
    let aValue, bValue
    
    switch (sortBy) {
      case "name":
        aValue = a.name.toLowerCase()
        bValue = b.name.toLowerCase()
        break
      case "status":
        aValue = a.state.toLowerCase()
        bValue = b.state.toLowerCase()
        break
      case "uptime":
        aValue = a.uptime_sec
        bValue = b.uptime_sec
        break
      case "cpu":
        aValue = a.cpu_percent
        bValue = b.cpu_percent
        break
      case "memory":
        aValue = a.memory_kb
        bValue = b.memory_kb
        break
      default:
        aValue = a.name.toLowerCase()
        bValue = b.name.toLowerCase()
    }
    
    if (aValue < bValue) return sortOrder === "asc" ? -1 : 1
    if (aValue > bValue) return sortOrder === "asc" ? 1 : -1
    return 0
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-foreground">{t('vm.loadingVMs')}</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`${SPACING.section} ${SPACING.page}`}>
        <ErrorState 
          title={t('vm.errorLoadingVMs')}
          description={error}
        />
      </div>
    )
  }

  return (
    <div className={SPACING.section}>
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('vm.virtualMachines')}</h1>
          <p className="text-muted-foreground">{t('vm.manageFleet')}</p>
        </div>
        <div className="flex gap-2">
          {selectedVMs.length > 0 && (
            <div className="flex gap-2">
              <ConsistentButton variant="outline" size="sm" className="hover-fast shadow-sm">
                <Play className="h-4 w-4" />
                {t('vm.start')} ({selectedVMs.length})
              </ConsistentButton>
              <ConsistentButton variant="outline" size="sm" className="hover-fast shadow-sm">
                <Square className="h-4 w-4" />
                {t('vm.stop')} ({selectedVMs.length})
              </ConsistentButton>
            </div>
          )}
          <ConsistentButton className="bg-primary text-primary-foreground hover:bg-primary/90 hover-fast shadow-md hover:shadow-lg" onClick={handleCreateVM}>
            <Plus className="h-4 w-4" />
            {t('vm.createVM')}
          </ConsistentButton>
        </div>
      </div>

      {/* Toolbar */}
      <Card className="shadow-sm border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t('vm.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 border-border/50 bg-surface-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36 border-border/50 bg-surface-2">
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder={t('vm.allStatus')} />
                </SelectTrigger>
                <SelectContent className="bg-surface-2 border-border/50 shadow-lg">
                  <SelectItem value="all">{t('vm.allStatus')}</SelectItem>
                  <SelectItem value="Running">{t('vm.running')}</SelectItem>
                  <SelectItem value="Shutoff">{t('vm.stopped')}</SelectItem>
                  <SelectItem value="Paused">{t('vm.paused')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Select value={sortBy} onValueChange={(value) => setSortBy(value)}>
                <SelectTrigger className="w-44 border-border/50 bg-surface-2">
                  <ArrowUpDown className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder={t('vm.sortByName')} />
                </SelectTrigger>
                <SelectContent className="bg-surface-2 border-border/50 shadow-lg">
                  <SelectItem value="name">{t('vm.sortByName')}</SelectItem>
                  <SelectItem value="status">{t('vm.sortByStatus')}</SelectItem>
                  <SelectItem value="uptime">{t('vm.sortByUptime')}</SelectItem>
                  <SelectItem value="cpu">{t('vm.sortByCPU')}</SelectItem>
                  <SelectItem value="memory">{t('vm.sortByMemory')}</SelectItem>
                </SelectContent>
              </Select>
              <ConsistentButton 
                variant="outline" 
                size="sm"
                className="border-border/50 bg-surface-2 hover:bg-accent/10 transition-all duration-200"
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              >
                {sortOrder === "asc" ? "↑" : "↓"}
              </ConsistentButton>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* VM Table */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="text-lg font-semibold">{t('vm.virtualMachines')} ({sortedVMs.length})</span>
            {selectedVMs.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">{selectedVMs.length} {t('vm.selected')}</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 pl-4">
                  <Checkbox
                    checked={selectedVMs.length === sortedVMs.length && sortedVMs.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead className="px-4">{t('common.status')}</TableHead>
                <TableHead className="px-4">{t('common.name')}</TableHead>
                <TableHead className="px-4">{t('vm.cpu_cores')}</TableHead>
                <TableHead className="px-4">{t('vm.memory')}</TableHead>
                <TableHead className="px-4">{t('vm.ipAddress')}</TableHead>
                <TableHead className="px-4">{t('vm.uptime')}</TableHead>
                <TableHead className="px-4">{t('vm.os')}</TableHead>
                <TableHead className="w-12 pr-4"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedVMs.map((vm) => (
                <TableRow 
                  key={vm.uuid} 
                  className="cursor-pointer hover:bg-surface-2 transition-all duration-150 border-b border-border/50 last:border-b-0"
                  onClick={() => navigateTo(routes.vmDetail(vm.uuid))}
                >
                  <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedVMs.includes(vm.uuid)}
                      onCheckedChange={(checked) => handleSelectVM(vm.uuid, checked as boolean)}
                    />
                  </TableCell>
                  <TableCell className="px-4">{getStatusBadge(vm.state)}</TableCell>
                  <TableCell className="px-4">
                    <div className="font-semibold text-foreground">{vm.name}</div>
                    <div className="text-xs text-muted-foreground">
                      CPU: {vm.cpu_percent ? vm.cpu_percent.toFixed(1) : 0}% • RAM: {formatMemory(vm.memory_kb)}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 font-semibold">{vm.vcpus}</TableCell>
                  <TableCell className="px-4">{formatMemory(vm.memory_kb)}</TableCell>
                  <TableCell className="font-mono text-sm px-4">
                    {vm.ip_addresses && vm.ip_addresses.length > 0 ? vm.ip_addresses[0] : "N/A"}
                  </TableCell>
                  <TableCell className="px-4">{formatUptime(vm.uptime_sec)}</TableCell>
                  <TableCell className="px-4">{vm.os_info || "Unknown"}</TableCell>
                  <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                    <ConsistentButton 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 px-3 hover:bg-accent focus:bg-accent"
                      onClick={() => navigateTo(routes.vmDetail(vm.uuid))}
                    >
                      <Eye className="mr-1 h-3 w-3" />
                      <span className="text-xs">{t('vm.details')}</span>
                    </ConsistentButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
