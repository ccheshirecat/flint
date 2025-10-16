import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, CheckCircle, Cpu, MemoryStick, HardDrive, AlertCircle, X } from "lucide-react"
import { HostResources } from "@/lib/api"
import { useState } from "react"
import { useTranslation } from "@/components/i18n-provider"

interface Alert {
  id: string
  type: "warning" | "info" | "error" | "success"
  message: string
  time: string
  priority: number // 1 = highest, 5 = lowest
  category: "cpu" | "memory" | "storage" | "vm" | "system" | "network"
}

interface SystemAlertsProps {
  alerts: Alert[]
  hostResources?: HostResources
}

export function SystemAlerts({ alerts, hostResources }: SystemAlertsProps) {
  const { t } = useTranslation()
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set())

  const handleDismissAlert = (alertId: string) => {
    setDismissedAlerts(prev => new Set([...prev, alertId]))
  }

  // Generate dynamic alerts based on resource usage
  const generateResourceAlerts = (): Alert[] => {
    if (!hostResources) return []

    const resourceAlerts: Alert[] = []
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    // CPU Usage Alert - simplified without VM data
    if (hostResources.cpu_cores > 0) {
      // For now, just show basic CPU info - VM-based calculation would need VM data prop
      const cpuInfo = `${hostResources.cpu_cores} ${t('vm.cpuCoresAvailable')}`
      resourceAlerts.push({
        id: `cpu-info-${Date.now()}`,
        type: "info",
        message: cpuInfo,
        time: now,
        priority: 4,
        category: "cpu"
      })
    }

    // Memory Usage Alert
    const memoryUsagePercent = hostResources.total_memory_kb > 0 
      ? ((hostResources.total_memory_kb - hostResources.free_memory_kb) / hostResources.total_memory_kb) * 100 
      : 0
    
    if (memoryUsagePercent > 90) {
      resourceAlerts.push({
        id: `memory-critical-${Date.now()}`,
        type: "error",
        message: `Critical: Host memory usage is at ${memoryUsagePercent.toFixed(1)}%`,
        time: now,
        priority: 1,
        category: "memory"
      })
    } else if (memoryUsagePercent > 80) {
      resourceAlerts.push({
        id: `memory-warning-${Date.now()}`,
        type: "warning",
        message: `High memory usage: ${memoryUsagePercent.toFixed(1)}% of total memory in use`,
        time: now,
        priority: 2,
        category: "memory"
      })
    }

    // Storage Usage Alert
    const storageUsagePercent = hostResources.storage_total_b > 0 
      ? (hostResources.storage_used_b / hostResources.storage_total_b) * 100 
      : 0
    
    if (storageUsagePercent > 95) {
      resourceAlerts.push({
        id: `storage-critical-${Date.now()}`,
        type: "error",
        message: `Critical: Storage usage is at ${storageUsagePercent.toFixed(1)}%`,
        time: now,
        priority: 1,
        category: "storage"
      })
    } else if (storageUsagePercent > 85) {
      resourceAlerts.push({
        id: `storage-warning-${Date.now()}`,
        type: "warning",
        message: `High storage usage: ${storageUsagePercent.toFixed(1)}% of total storage used`,
        time: now,
        priority: 2,
        category: "storage"
      })
    }

    return resourceAlerts
  }

  const getAlertIcon = (type: Alert["type"], category: Alert["category"]) => {
    const baseClasses = "h-4 w-4"
    
    // Color based on type
    let colorClasses = ""
    switch (type) {
      case "error":
        colorClasses = "text-destructive"
        break
      case "warning":
        colorClasses = "text-warning"
        break
      case "success":
        colorClasses = "text-success"
        break
      default:
        colorClasses = "text-primary"
    }

    // Icon based on category
    switch (category) {
      case "cpu":
        return <Cpu className={`${baseClasses} ${colorClasses}`} />
      case "memory":
        return <MemoryStick className={`${baseClasses} ${colorClasses}`} />
      case "storage":
        return <HardDrive className={`${baseClasses} ${colorClasses}`} />
      case "network":
        return <AlertCircle className={`${baseClasses} ${colorClasses}`} />
      case "vm":
        return <AlertCircle className={`${baseClasses} ${colorClasses}`} />
      default:
        return type === "error" || type === "warning" 
          ? <AlertTriangle className={`${baseClasses} ${colorClasses}`} />
          : <CheckCircle className={`${baseClasses} ${colorClasses}`} />
    }
  }

  const getAlertBorderClass = (type: Alert["type"]) => {
    switch (type) {
      case "error":
        return "border-l-destructive"
      case "warning":
        return "border-l-warning"
      case "success":
        return "border-l-success"
      default:
        return "border-l-primary"
    }
  }

  // Combine static alerts with dynamic resource alerts, but deduplicate storage alerts
  const resourceAlerts = generateResourceAlerts()
  const backendAlerts = alerts.map(alert => ({
    ...alert,
    id: alert.id || `backend-${alert.message.slice(0, 20)}-${Date.now()}` // Ensure backend alerts have IDs
  }))
  
  // Deduplicate storage alerts - prefer backend alerts over frontend ones
  const hasBackendStorageAlert = backendAlerts.some(alert => 
    alert.message.toLowerCase().includes('storage usage')
  )
  
  const filteredResourceAlerts = hasBackendStorageAlert 
    ? resourceAlerts.filter(alert => alert.category !== 'storage')
    : resourceAlerts
  
  const allAlerts = [...backendAlerts, ...filteredResourceAlerts]
  
  // Filter out dismissed alerts, sort by priority (highest first) and limit to top 4
  const sortedAlerts = allAlerts
    .filter(alert => !dismissedAlerts.has(alert.id))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 4)

  if (sortedAlerts.length === 0) return null

  return (
    <Card className="border-l-4 border-l-accent">
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-accent" />
          {t('vm.systemAlerts')}
        </CardTitle>
      </CardHeader>
      <CardContent className="py-1 px-3">
        <div className="space-y-1">
          {sortedAlerts.map((alert) => (
            <div 
              key={alert.id} 
              className={`flex items-center justify-between rounded bg-muted/30 p-2 border-l-2 ${getAlertBorderClass(alert.type)}`}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {getAlertIcon(alert.type, alert.category)}
                <div className="flex-1 min-w-0">
                  <span className="text-xs leading-tight block truncate">{alert.message}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{alert.time}</span>
                    <span className="text-xs px-1 py-0.5 rounded bg-muted/50 text-muted-foreground capitalize">
                      {alert.category}
                    </span>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:bg-muted-foreground/20 flex-shrink-0 ml-1"
                onClick={() => handleDismissAlert(alert.id)}
              >
                <X className="h-2.5 w-2.5" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}