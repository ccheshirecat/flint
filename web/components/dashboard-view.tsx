"use client"

import { useState, useEffect } from "react"
import { useTranslation } from '@/components/i18n-provider'
import { navigateTo, routes } from "@/lib/navigation"
import { SPACING, TYPOGRAPHY, GRIDS, TRANSITIONS } from "@/lib/ui-constants"
import { ConsistentButton } from "@/components/ui/consistent-button"
import { ErrorState } from "@/components/ui/error-state"
import { Button } from "@/components/ui/button"
import { TrendingUp, Plus, Loader2 } from "lucide-react"
import { ResourceCard } from "@/components/shared/resource-card"
import { SystemAlerts } from "@/components/shared/system-alerts"
import { ActivityFeed } from "@/components/shared/activity-feed"
import { QuickActions } from "@/components/shared/quick-actions"
import { VMCard } from "@/components/shared/vm-card"
import { Cpu, MemoryStick, HardDrive, Network, Activity, Play, Square, Clock } from "lucide-react"
import { hostAPI, HostStatus, HostResources, vmAPI, VMSummary } from "@/lib/api"
import { useToast } from "@/components/ui/use-toast"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Server } from "lucide-react"

// Real alerts will come from enhanced HostStatus.health_checks

interface Activity {
  action: string
  target: string
  time: string
  user: string
}

export function DashboardView() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [hostStatus, setHostStatus] = useState<HostStatus | null>(null)
  const [hostResources, setHostResources] = useState<HostResources | null>(null)
  const [virtualMachines, setVirtualMachines] = useState<VMSummary[]>([])
  const [recentActivity, setRecentActivity] = useState<Activity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setIsLoading(true)
        const [status, resources, vms] = await Promise.all([
          hostAPI.getStatus(),
          hostAPI.getResources(),
          vmAPI.getAll()
        ])
        setHostStatus(status)
        setHostResources(resources)
        setVirtualMachines(vms)

        // Fetch activity data
        try {
          const activityResponse = await fetch('/api/activity')
          if (activityResponse.ok) {
            const activityData: any[] = await activityResponse.json()
            // Transform to frontend format
            const transformedActivity = activityData.slice(0, 10).map(event => ({
              action: translateActivityAction(event.action),
              target: event.target,
              time: formatTimestamp(event.timestamp),
              user: "system" // Backend doesn't provide user yet
            }))
            setRecentActivity(transformedActivity)
          }
        } catch (activityErr) {
          console.warn('Failed to fetch activity:', activityErr)
          // Keep empty array as fallback
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard data")
      } finally {
        setIsLoading(false)
      }
    }

    fetchDashboardData()
  }, [])

  const vmStats = {
    total: virtualMachines.length,
    running: virtualMachines.filter((vm) => vm.state === "Running").length,
    stopped: virtualMachines.filter((vm) => vm.state === "Shutoff").length,
    paused: virtualMachines.filter((vm) => vm.state === "Paused").length,
  }

  const formatMemory = (kb: number) => {
    if (!kb || isNaN(kb)) return "0"
    const gb = kb / 1024 / 1024
    return gb.toFixed(1)
  }

  const formatStorage = (bytes: number) => {
    if (!bytes || isNaN(bytes)) return "0"
    const gb = bytes / 1024 / 1024 / 1024
    return gb.toFixed(0)
  }

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  const formatTimestamp = (timestamp: number) => {
    const now = Date.now() / 1000
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60)
    const hours = Math.floor(diff / 3600)
    const days = Math.floor(diff / 86400)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return t('vm.justNow')
  }

  const translateActivityAction = (action: string) => {
    switch (action) {
      case "VM Started":
        return t('vm.vmStarted')
      case "VM Stopped":
        return t('vm.vmStopped')
      default:
        return action
    }
  }

  const handleVMAction = async (action: string, vmId: string) => {
    if (action === "console") {
      // Check if console endpoint exists first
      fetch(`/api/vms/${vmId}/serial-console`)
        .then(response => {
          if (response.ok) {
            window.open(`/vms/console?id=${vmId}`, '_blank');
          } else {
            toast({
              title: "Console Not Available",
              description: "Serial console is not available for this VM. Make sure the VM is running.",
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
      return;
    }

    if (action === "detail") {
      navigateTo(routes.vmDetail(vmId));
      return;
    }

    try {
      // Show loading state
      toast({
        title: "Processing...",
        description: `Performing ${action} action on VM...`,
      })

      const response = await fetch(`/api/vms/${vmId}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      })

      if (!response.ok) {
        throw new Error(`Failed to ${action} VM`)
      }

      // Refresh VM data after action
      const [status, resources, vms] = await Promise.all([
        hostAPI.getStatus(),
        hostAPI.getResources(),
        vmAPI.getAll()
      ])
      setHostStatus(status)
      setHostResources(resources)
      setVirtualMachines(vms)

      // Show success message
      toast({
        title: "Success",
        description: `VM ${action}ed successfully`,
      })
    } catch (error) {
      console.error(`Failed to ${action} VM:`, error)
      toast({
        title: "Error",
        description: `Failed to ${action} VM: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      })
    }
  }

  if (isLoading) {
    return <LoadingState title={t('common.loading')} description="Please wait while we fetch your data" />
  }

  if (error || !hostResources || !hostStatus) {
    return (
      <div className={SPACING.section}>
        <ErrorState 
          title={t('common.error')}
          description={error || "Failed to load dashboard data"}
        />
      </div>
    )
  }

  return (
    <div className={SPACING.section}>
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <ConsistentButton 
            variant="outline" 
            size="sm" 
            className="hover-fast shadow-sm hover:shadow-md border-border/50"
            onClick={() => navigateTo(routes.analytics)}
          >
            <TrendingUp className="h-4 w-4" />
            {t('vm.viewAnalytics')}
          </ConsistentButton>
          <ConsistentButton onClick={() => navigateTo(routes.vmCreate)} className="bg-primary text-primary-foreground hover:bg-primary/90 hover-fast shadow-md hover:shadow-lg">
            <Plus className="h-4 w-4" />
            {t('vm.createVM')}
          </ConsistentButton>
        </div>
      </div>

      {hostStatus?.health_checks && (
        <div className="mb-8">
          <SystemAlerts 
            alerts={hostStatus.health_checks.map((check, index) => ({
              id: `health-check-${index}-${Date.now()}`,
              type: check.type as "warning" | "info" | "error",
              message: check.message,
              time: t('vm.justNow'),
              priority: check.type === "error" ? 1 : check.type === "warning" ? 2 : 3,
              category: "system"
            }))} 
            hostResources={hostResources}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Host Resources & VM Stats */}
        <div className="space-y-6 lg:col-span-2">
          <div>
            <h2 className="text-xl font-semibold mb-6">{t('dashboard.hostResources')}</h2>
            <div className={`${GRIDS.fourCol} ${SPACING.gridCompact}`}>
               <ResourceCard
                 title={t('common.cpuUsage')}
                 value="0%"
                 percentage={0}
                 icon={<Cpu className="h-4 w-4" />}
               >
                 <p className="text-xs text-muted-foreground mt-1">
                   {hostResources?.cpu_cores || 0} {t('vm.cores')}
                 </p>
               </ResourceCard>

              <ResourceCard
                title={t('common.memory')}
                value={`${formatMemory((hostResources?.total_memory_kb || 0) - (hostResources?.free_memory_kb || 0))}GB`}
                percentage={hostResources?.total_memory_kb && hostResources?.free_memory_kb ? ((hostResources.total_memory_kb - hostResources.free_memory_kb) / hostResources.total_memory_kb * 100) : 0}
                icon={<MemoryStick className="h-4 w-4" />}
              >
                <p className="text-xs text-muted-foreground mt-1">{formatMemory(hostResources?.free_memory_kb || 0)}GB {t('vm.available')}</p>
              </ResourceCard>

               <ResourceCard
                 title={t('common.storage')}
                 value={`${formatStorage(hostResources.storage_used_b || 0)}GB`}
                 percentage={hostResources.storage_total_b ? (hostResources.storage_used_b / hostResources.storage_total_b) * 100 : 0}
                 icon={<HardDrive className="h-4 w-4" />}
               >
                 <p className="text-xs text-muted-foreground mt-1">{formatStorage(hostResources.storage_total_b || 0)}GB {t('vm.total')}</p>
               </ResourceCard>

               <ResourceCard title={t('networking.title')} value={(hostResources.active_interfaces || 0).toString()} icon={<Network className="h-4 w-4" />}>
                 <div className="mt-2 text-xs text-muted-foreground">{t('networking.activeInterfaces')}</div>
                 <p className="text-xs text-muted-foreground mt-1">{t('vm.networkMonitoring')}</p>
               </ResourceCard>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-6">{t('dashboard.vmOverview')}</h2>
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
              <ResourceCard title={t('dashboard.totalVMs')} value={vmStats.total.toString()} icon={<Activity className="h-4 w-4" />} />
              <ResourceCard
                title={t('dashboard.running')}
                value={vmStats.running.toString()}
                icon={<Play className="h-4 w-4 text-green-500" />}
                className="text-green-500"
              />
              <ResourceCard 
                title={t('dashboard.stopped')} 
                value={vmStats.stopped.toString()} 
                icon={<Square className="h-4 w-4 text-red-500" />} 
                className="text-red-500"
              />
              <ResourceCard
                title={t('dashboard.paused')}
                value={vmStats.paused.toString()}
                icon={<Clock className="h-4 w-4 text-yellow-500" />}
                className="text-yellow-500"
              />
            </div>
          </div>

          <div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6">
              <h2 className="text-xl font-semibold">{t('vm.virtualMachines')}</h2>
              <ConsistentButton
                variant="outline"
                size="sm"
                className="self-start hover-fast shadow-sm hover:shadow-md border-border/50"
                onClick={() => navigateTo(routes.vms)}
              >
                {t('dashboard.viewAll')}
              </ConsistentButton>
            </div>

            {virtualMachines.length > 0 ? (
              <div className={`${GRIDS.threeCol} ${SPACING.grid}`}>
                {virtualMachines.slice(0, 6).map((vm) => {
                  // Transform VMSummary to match VMCard interface
                  const transformedVM = {
                    id: parseInt(vm.uuid.slice(-4), 16) || 1, // Simple ID from UUID
                    name: vm.name,
                    status: vm.state === "Running" ? "running" as const :
                            vm.state === "Shutoff" ? "stopped" as const :
                            vm.state === "Paused" ? "paused" as const : "stopped" as const,
                    cpu: Math.round(vm.cpu_percent),
                    memory: {
                      used: Math.round((vm.memory_kb * vm.cpu_percent / 100) / 1024 / 1024),
                      total: Math.round(vm.memory_kb / 1024 / 1024)
                    },
                    uptime: formatUptime(vm.uptime_sec),
                    os: vm.os_info || "Unknown",
                    ip: vm.ip_addresses && vm.ip_addresses.length > 0 ? vm.ip_addresses[0] : vm.uuid.slice(0, 8) + "..."
                  }
                  return (
                    <div 
                      key={vm.uuid}
                      className="cursor-pointer"
                      onClick={() => navigateTo(routes.vmDetail(vm.uuid))}
                    >
                      <VMCard 
                        vm={transformedVM} 
                        onAction={(action, vmId) => {
                          if (action === "detail") {
                            navigateTo(routes.vmDetail(vm.uuid))
                          } else {
                            handleVMAction(action, vm.uuid)
                          }
                        }} 
                      />
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState
                title={t('dashboard.noVMs')}
                description={t('dashboard.noVMsDescription')}
                icon={<Server className="h-8 w-8 text-muted-foreground" />}
                action={
                  <ConsistentButton onClick={() => navigateTo(routes.vmCreate)}>
                    <Plus className="h-4 w-4" />
                    {t('vm.createVM')}
                  </ConsistentButton>
                }
              />
            )}
          </div>
        </div>

        {/* Right Sidebar - Hidden on mobile, shown on larger screens */}
        <div className="hidden lg:block space-y-8">
          <ActivityFeed activities={recentActivity} />
          <QuickActions />
        </div>
      </div>
    </div>
  )
}