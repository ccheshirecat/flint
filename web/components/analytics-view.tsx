"use client"

import { useState, useEffect } from "react"
import { useTranslation } from "@/components/i18n-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
// import { DatePicker } from "@/components/ui/date-picker"
import { cn } from "@/lib/utils"
import { hostAPI } from "@/lib/api"
import { refreshPage } from "@/lib/navigation"
import { SPACING, TYPOGRAPHY, GRIDS, TRANSITIONS, COLORS } from "@/lib/ui-constants"
import { ConsistentButton } from "@/components/ui/consistent-button"
import { ErrorState } from "@/components/ui/error-state"
import { useToast } from "@/components/ui/use-toast"
import {
  Activity,
  TrendingUp,
  BarChart3,
  LineChart,
  PieChart,
  Download,
  Calendar,
  Filter,
  RefreshCw,
  HardDrive,
  Network,
  Cpu,
  MemoryStick,
  Server,
} from "lucide-react"

export function AnalyticsView() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("overview")
  const [timeRange, setTimeRange] = useState("24h")
  const [metrics, setMetrics] = useState<any | null>(null)
  const [hostStatus, setHostStatus] = useState<any | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setIsLoading(true)
        const [resourcesData, statusData] = await Promise.all([
          hostAPI.getResources(),
          hostAPI.getStatus()
        ])
        setMetrics(resourcesData)
        setHostStatus(statusData)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load analytics data")
        toast({
          title: "Error",
          description: "Failed to load analytics data",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchMetrics()
    
    // Set up auto-refresh every 30 seconds
    const interval = setInterval(fetchMetrics, 30000)
    return () => clearInterval(interval)
  }, [timeRange])

  if (isLoading) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-display font-bold text-foreground">Analytics</h1>
          <div className="flex gap-2">
            <div className="h-9 w-32 bg-surface-2 rounded-md animate-pulse" />
            <div className="h-9 w-32 bg-surface-2 rounded-md animate-pulse" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="animate-fade-in">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                {t('common.cpuUsage')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-64 bg-surface-2 rounded-lg animate-pulse" />
            </CardContent>
          </Card>
          <Card className="animate-fade-in">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                {t('analytics.memoryUsage')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-64 bg-surface-2 rounded-lg animate-pulse" />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-display font-bold text-foreground">{t('analytics.title')}</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refreshPage()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('analytics.refresh')}
            </Button>
          </div>
        </div>
        <div className={`${SPACING.section} ${SPACING.page}`}>
          <ErrorState 
            title={t('analytics.errorLoadingAnalytics')}
            description={error}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={`${SPACING.section} ${TRANSITIONS.slideUp}`}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className={TYPOGRAPHY.pageTitle}>{t('analytics.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('analytics.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <ConsistentButton 
            variant="outline" 
            size="sm"
            onClick={() => {
              refreshPage()
            }}
            icon={<RefreshCw className="h-4 w-4" />}
          >
            {t('analytics.refresh')}
          </ConsistentButton>
          <ConsistentButton 
            variant="outline" 
            size="sm"
            onClick={() => {
              if (!metrics || !hostStatus) return
              
              const data = {
                timestamp: new Date().toISOString(),
                timeRange,
                host: {
                  hostname: hostStatus.hostname,
                  hypervisor: hostStatus.hypervisor_version,
                  total_vms: hostStatus.total_vms,
                  running_vms: hostStatus.running_vms
                },
                resources: {
                  cpu_cores: metrics.cpu_cores,
                  total_memory_kb: metrics.total_memory_kb,
                  free_memory_kb: metrics.free_memory_kb,
                  storage_total_b: metrics.storage_total_b,
                  storage_used_b: metrics.storage_used_b
                }
              }
              
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const link = document.createElement('a')
              link.href = url
              link.download = `flint-analytics-${new Date().toISOString().split('T')[0]}.json`
              document.body.appendChild(link)
              link.click()
              document.body.removeChild(link)
              URL.revokeObjectURL(url)
              
              toast({
                title: t('analytics.exportComplete'),
                description: t('analytics.exportSuccess'),
              })
            }}
            icon={<Download className="h-4 w-4" />}
          >
            {t('analytics.export')}
          </ConsistentButton>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="hover-premium transition-all duration-200">
            <Activity className="mr-2 h-4 w-4" />
            {t('analytics.overview')}
          </TabsTrigger>
          <TabsTrigger value="cpu" className="hover-premium transition-all duration-200">
            <Activity className="mr-2 h-4 w-4" />
            {t('analytics.cpu')}
          </TabsTrigger>
          <TabsTrigger value="memory" className="hover-premium transition-all duration-200">
            <TrendingUp className="mr-2 h-4 w-4" />
            {t('analytics.memory')}
          </TabsTrigger>
          <TabsTrigger value="storage" className="hover-premium transition-all duration-200">
            <HardDrive className="mr-2 h-4 w-4" />
            {t('analytics.storage')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics Cards */}
          <div className={`${GRIDS.fourCol} ${SPACING.gridCompact}`}>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('analytics.cpuCores')}</p>
                    <p className="text-2xl font-bold">{metrics?.cpu_cores || 0}</p>
                  </div>
                  <Cpu className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('analytics.memoryUsage')}</p>
                    <p className="text-2xl font-bold">
                      {metrics ? `${Math.round(((metrics.total_memory_kb - metrics.free_memory_kb) / metrics.total_memory_kb) * 100)}%` : '0%'}
                    </p>
                  </div>
                  <MemoryStick className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('analytics.storageUsage')}</p>
                    <p className="text-2xl font-bold">
                      {metrics ? `${Math.round((metrics.storage_used_b / metrics.storage_total_b) * 100)}%` : '0%'}
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
                    <p className="text-sm font-medium text-muted-foreground">{t('analytics.runningVMs')}</p>
                    <p className="text-2xl font-bold">{hostStatus?.running_vms || 0}</p>
                  </div>
                  <Server className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className={`${GRIDS.twoCol} ${SPACING.grid}`}>
            <Card className="animate-fade-in">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <MemoryStick className="h-4 w-4" />
                  {t('analytics.memoryUsage')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{t('analytics.usedMemory')}</span>
                    <span>{metrics ? `${Math.round((metrics.total_memory_kb - metrics.free_memory_kb) / 1024 / 1024)}GB / ${Math.round(metrics.total_memory_kb / 1024 / 1024)}GB` : 'Loading...'}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-primary h-3 rounded-full transition-all duration-300"
                      style={{ 
                        width: metrics ? `${((metrics.total_memory_kb - metrics.free_memory_kb) / metrics.total_memory_kb) * 100}%` : '0%' 
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t('analytics.free')}: {metrics ? `${Math.round(metrics.free_memory_kb / 1024 / 1024)}GB` : '0GB'}</span>
                    <span>{metrics ? `${Math.round(((metrics.total_memory_kb - metrics.free_memory_kb) / metrics.total_memory_kb) * 100)}%` : '0%'} {t('analytics.used')}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="animate-fade-in">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  {t('analytics.storageUsage')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{t('analytics.usedStorage')}</span>
                    <span>{metrics ? `${Math.round(metrics.storage_used_b / 1024 / 1024 / 1024)}GB / ${Math.round(metrics.storage_total_b / 1024 / 1024 / 1024)}GB` : 'Loading...'}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-primary h-3 rounded-full transition-all duration-300"
                      style={{ 
                        width: metrics ? `${(metrics.storage_used_b / metrics.storage_total_b) * 100}%` : '0%' 
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t('analytics.free')}: {metrics ? `${Math.round((metrics.storage_total_b - metrics.storage_used_b) / 1024 / 1024 / 1024)}GB` : '0GB'}</span>
                    <span>{metrics ? `${Math.round((metrics.storage_used_b / metrics.storage_total_b) * 100)}%` : '0%'} {t('analytics.used')}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="animate-fade-in">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  System Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Hostname</p>
                    <p className="font-medium">{hostStatus?.hostname || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Hypervisor</p>
                    <p className="font-medium">{hostStatus?.hypervisor_version || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total VMs</p>
                    <p className="font-medium">{hostStatus?.total_vms || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Running VMs</p>
                    <p className="font-medium text-green-600">{hostStatus?.running_vms || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">CPU Cores</p>
                    <p className="font-medium">{metrics?.cpu_cores || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total Memory</p>
                    <p className="font-medium">{metrics ? `${Math.round(metrics.total_memory_kb / 1024 / 1024)}GB` : '0GB'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="animate-fade-in">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Resource Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Memory</span>
                      <span>{metrics ? `${Math.round(((metrics.total_memory_kb - metrics.free_memory_kb) / metrics.total_memory_kb) * 100)}%` : '0%'}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: metrics ? `${((metrics.total_memory_kb - metrics.free_memory_kb) / metrics.total_memory_kb) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Storage</span>
                      <span>{metrics ? `${Math.round((metrics.storage_used_b / metrics.storage_total_b) * 100)}%` : '0%'}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: metrics ? `${(metrics.storage_used_b / metrics.storage_total_b) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>VM Utilization</span>
                      <span>{hostStatus ? `${Math.round((hostStatus.running_vms / Math.max(hostStatus.total_vms, 1)) * 100)}%` : '0%'}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: hostStatus ? `${(hostStatus.running_vms / Math.max(hostStatus.total_vms, 1)) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="animate-fade-in">
            <CardHeader className="pb-3">
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Activity className="h-4 w-4 text-green-500" />
                  <div>
                    <p className="font-medium">VM started</p>
                    <p className="text-sm text-muted-foreground">web-server-01 started successfully</p>
                  </div>
                  <div className="ml-auto text-xs text-muted-foreground">2 min ago</div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Activity className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="font-medium">Network configured</p>
                    <p className="text-sm text-muted-foreground">eth0 connected to default network</p>
                  </div>
                  <div className="ml-auto text-xs text-muted-foreground">5 min ago</div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Activity className="h-4 w-4 text-yellow-500" />
                  <div>
                    <p className="font-medium">High CPU usage detected</p>
                    <p className="text-sm text-muted-foreground">CPU usage exceeded 80% threshold</p>
                  </div>
                  <div className="ml-auto text-xs text-muted-foreground">10 min ago</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cpu" className="space-y-6">
          <Card className="animate-fade-in">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                CPU Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold">CPU Details</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Cores</span>
                      <span className="font-medium">{metrics?.cpu_cores || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Architecture</span>
                      <span className="font-medium">x86_64</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Hypervisor</span>
                      <span className="font-medium">{hostStatus?.hypervisor_version || 'Unknown'}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="font-semibold">VM Distribution</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Running VMs</span>
                      <span className="font-medium text-green-600">{hostStatus?.running_vms || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total VMs</span>
                      <span className="font-medium">{hostStatus?.total_vms || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stopped VMs</span>
                      <span className="font-medium text-red-600">{hostStatus ? (hostStatus.total_vms - hostStatus.running_vms) : 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="memory" className="space-y-6">
          <Card className="animate-fade-in">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <MemoryStick className="h-4 w-4" />
                Memory Analytics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold">Memory Usage</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Used Memory</span>
                        <span>{metrics ? `${Math.round((metrics.total_memory_kb - metrics.free_memory_kb) / 1024 / 1024)}GB` : '0GB'}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-4">
                        <div
                          className="bg-blue-500 h-4 rounded-full transition-all duration-300"
                          style={{ width: metrics ? `${((metrics.total_memory_kb - metrics.free_memory_kb) / metrics.total_memory_kb) * 100}%` : '0%' }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Total Memory</p>
                        <p className="font-medium">{metrics ? `${Math.round(metrics.total_memory_kb / 1024 / 1024)}GB` : '0GB'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Free Memory</p>
                        <p className="font-medium">{metrics ? `${Math.round(metrics.free_memory_kb / 1024 / 1024)}GB` : '0GB'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Usage Percentage</p>
                        <p className="font-medium">{metrics ? `${Math.round(((metrics.total_memory_kb - metrics.free_memory_kb) / metrics.total_memory_kb) * 100)}%` : '0%'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Available</p>
                        <p className="font-medium text-green-600">{metrics ? `${Math.round(metrics.free_memory_kb / 1024 / 1024)}GB` : '0GB'}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="font-semibold">Memory Distribution</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span className="text-sm">Used Memory</span>
                      </div>
                      <span className="font-medium">{metrics ? `${Math.round(((metrics.total_memory_kb - metrics.free_memory_kb) / metrics.total_memory_kb) * 100)}%` : '0%'}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
                        <span className="text-sm">Free Memory</span>
                      </div>
                      <span className="font-medium">{metrics ? `${Math.round((metrics.free_memory_kb / metrics.total_memory_kb) * 100)}%` : '0%'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage" className="space-y-6">
          <Card className="animate-fade-in">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                Storage Analytics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold">Storage Usage</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Used Storage</span>
                        <span>{metrics ? `${Math.round(metrics.storage_used_b / 1024 / 1024 / 1024)}GB` : '0GB'}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-4">
                        <div
                          className="bg-green-500 h-4 rounded-full transition-all duration-300"
                          style={{ width: metrics ? `${(metrics.storage_used_b / metrics.storage_total_b) * 100}%` : '0%' }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Total Storage</p>
                        <p className="font-medium">{metrics ? `${Math.round(metrics.storage_total_b / 1024 / 1024 / 1024)}GB` : '0GB'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Free Storage</p>
                        <p className="font-medium">{metrics ? `${Math.round((metrics.storage_total_b - metrics.storage_used_b) / 1024 / 1024 / 1024)}GB` : '0GB'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Usage Percentage</p>
                        <p className="font-medium">{metrics ? `${Math.round((metrics.storage_used_b / metrics.storage_total_b) * 100)}%` : '0%'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Available</p>
                        <p className="font-medium text-green-600">{metrics ? `${Math.round((metrics.storage_total_b - metrics.storage_used_b) / 1024 / 1024 / 1024)}GB` : '0GB'}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="font-semibold">Storage Distribution</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <span className="text-sm">Used Storage</span>
                      </div>
                      <span className="font-medium">{metrics ? `${Math.round((metrics.storage_used_b / metrics.storage_total_b) * 100)}%` : '0%'}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
                        <span className="text-sm">Free Storage</span>
                      </div>
                      <span className="font-medium">{metrics ? `${Math.round(((metrics.storage_total_b - metrics.storage_used_b) / metrics.storage_total_b) * 100)}%` : '0%'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
