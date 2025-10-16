"use client"

import { useState, useEffect } from "react"
import { useTranslation } from "@/components/i18n-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/components/ui/use-toast"
import { 
  Network, 
  Wifi, 
  Cable, 
  Router, 
  Plus, 
  Settings, 
  Activity,
  ArrowUpDown,
  HardDrive,
  Zap
} from "lucide-react"
import { networkAPI, VirtualNetwork, SystemInterface } from "@/lib/api"
import { SPACING, TYPOGRAPHY, GRIDS, TRANSITIONS } from "@/lib/ui-constants"
import { ErrorState } from "@/components/ui/error-state"

export function EnhancedNetworkingView() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [virtualNetworks, setVirtualNetworks] = useState<VirtualNetwork[]>([])
  const [systemInterfaces, setSystemInterfaces] = useState<SystemInterface[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("overview")
  
  // Create network dialog state
  const [isCreateNetworkOpen, setIsCreateNetworkOpen] = useState(false)
  const [networkName, setNetworkName] = useState("")
  const [forwardMode, setForwardMode] = useState("nat")
  const [deviceBinding, setDeviceBinding] = useState("")
  const [ipv4Address, setIpv4Address] = useState("192.168.100.1")
  const [prefixLength, setPrefixLength] = useState("24")
  const [dhcpEnabled, setDhcpEnabled] = useState(true)
  const [dhcpStart, setDhcpStart] = useState("192.168.100.10")
  const [dhcpEnd, setDhcpEnd] = useState("192.168.100.254")
  
  // Create bridge dialog state
  const [isCreateBridgeOpen, setIsCreateBridgeOpen] = useState(false)
  const [bridgeName, setBridgeName] = useState("br0")
  const [bridgePorts, setBridgePorts] = useState<string[]>([])
  const [stpEnabled, setStpEnabled] = useState(false)

  useEffect(() => {
    const fetchNetworkData = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        const [networks, interfaces] = await Promise.all([
          networkAPI.getNetworks(),
          networkAPI.getSystemInterfaces()
        ])
        
        setVirtualNetworks(networks)
        setSystemInterfaces(interfaces)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load network data")
      } finally {
        setIsLoading(false)
      }
    }

    fetchNetworkData()
  }, [])

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec === 0) return '0 bps'
    const k = 1000
    const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps']
    const i = Math.floor(Math.log(bytesPerSec * 8) / Math.log(k))
    return parseFloat(((bytesPerSec * 8) / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const getInterfaceIcon = (type: string) => {
    switch (type) {
      case 'physical': return <Cable className="h-4 w-4" />
      case 'wireless': return <Wifi className="h-4 w-4" />
      case 'bridge': return <Router className="h-4 w-4" />
      case 'virtual': return <Network className="h-4 w-4" />
      case 'tap': return <Zap className="h-4 w-4" />
      default: return <Network className="h-4 w-4" />
    }
  }

  const getStatusBadge = (state: string) => {
    switch (state.toLowerCase()) {
      case 'up':
        return <Badge className="bg-green-500 text-white">{t('networking.active')}</Badge>
      case 'down':
        return <Badge className="bg-red-500 text-white">{t('networking.inactive')}</Badge>
      default:
        return <Badge variant="outline">{state}</Badge>
    }
  }

  if (isLoading) {
    return (
      <div className={`${SPACING.section} ${SPACING.page}`}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>{t('networking.loadingNetworkInterfaces')}</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`${SPACING.section} ${SPACING.page}`}>
        <ErrorState 
          title={t('networking.errorLoadingNetworkData')}
          description={error}
        />
      </div>
    )
  }

  const physicalInterfaces = systemInterfaces.filter(iface => 
    ['physical', 'wireless'].includes(iface.type)
  )
  const bridgeInterfaces = systemInterfaces.filter(iface => 
    iface.type === 'bridge'
  )
  const virtualInterfaces = systemInterfaces.filter(iface => 
    ['virtual', 'tap', 'libvirt-bridge'].includes(iface.type)
  )

  return (
    <div className={`${SPACING.section} ${SPACING.page}`}>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className={TYPOGRAPHY.pageTitle}>{t('networking.title')}</h1>
          <p className="text-muted-foreground">{t('networking.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isCreateBridgeOpen} onOpenChange={setIsCreateBridgeOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                {t('networking.addBridge')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{t('networking.createBridgeInterface')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="bridge-name">{t('networking.bridgeName')}</Label>
                  <Input
                    id="bridge-name"
                    value={bridgeName}
                    onChange={(e) => setBridgeName(e.target.value)}
                    placeholder="br0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('networking.physicalPorts')}</Label>
                  <div className="space-y-2">
                    {physicalInterfaces.map(iface => (
                      <div key={iface.name} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`port-${iface.name}`}
                          checked={bridgePorts.includes(iface.name)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setBridgePorts([...bridgePorts, iface.name])
                            } else {
                              setBridgePorts(bridgePorts.filter(p => p !== iface.name))
                            }
                          }}
                        />
                        <Label htmlFor={`port-${iface.name}`}>{iface.name}</Label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="stp-enabled"
                    checked={stpEnabled}
                    onChange={(e) => setStpEnabled(e.target.checked)}
                  />
                  <Label htmlFor="stp-enabled">{t('networking.enableStp')}</Label>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsCreateBridgeOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={async () => {
                  if (!bridgeName.trim()) {
                    toast({
                      title: "Error",
                      description: "Bridge name is required",
                      variant: "destructive",
                    })
                    return
                  }
                  
                  try {
                    const response = await fetch('/api/bridges', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: bridgeName,
                        ports: bridgePorts,
                        stp: stpEnabled
                      })
                    })
                    
                    if (!response.ok) {
                      const errorData = await response.json().catch(() => ({}))
                      throw new Error(errorData.error || 'Failed to create bridge')
                    }
                    
                    toast({
                      title: "Success",
                      description: `Bridge "${bridgeName}" created successfully`,
                    })
                    
                    // Refresh the interfaces list
                    const interfaces = await networkAPI.getSystemInterfaces()
                    setSystemInterfaces(interfaces)
                    
                    // Reset form and close dialog
                    setBridgeName("br0")
                    setBridgePorts([])
                    setStpEnabled(false)
                    setIsCreateBridgeOpen(false)
                  } catch (error) {
                    toast({
                      title: "Error",
                      description: `Failed to create bridge: ${error instanceof Error ? error.message : 'Unknown error'}`,
                      variant: "destructive",
                    })
                  }
                }}>
                  {t('common.create')} {t('networking.bridge')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          
          <Dialog open={isCreateNetworkOpen} onOpenChange={setIsCreateNetworkOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t('networking.createNetwork')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>{t('networking.createNetwork')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="network-name">Network Name</Label>
                  <Input
                    id="network-name"
                    value={networkName}
                    onChange={(e) => setNetworkName(e.target.value)}
                    placeholder="my-network"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="forward-mode">Forward Mode</Label>
                  <Select value={forwardMode} onValueChange={setForwardMode}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nat">NAT</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="isolated">Isolated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {forwardMode !== 'isolated' && (
                  <div className="space-y-2">
                    <Label htmlFor="device-binding">Device Binding</Label>
                    <Select value={deviceBinding} onValueChange={setDeviceBinding}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select interface" />
                      </SelectTrigger>
                      <SelectContent>
                        {physicalInterfaces.map(iface => (
                          <SelectItem key={iface.name} value={iface.name}>
                            {iface.name} ({iface.ip_addresses && Array.isArray(iface.ip_addresses) && iface.ip_addresses[0] || 'No IP'})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                <Separator />
                
                <div className="space-y-4">
                  <h4 className="font-medium">IP Configuration</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="ipv4-address">IPv4 Address</Label>
                      <Input
                        id="ipv4-address"
                        value={ipv4Address}
                        onChange={(e) => setIpv4Address(e.target.value)}
                        placeholder="192.168.100.1"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prefix-length">Prefix Length</Label>
                      <Input
                        id="prefix-length"
                        value={prefixLength}
                        onChange={(e) => setPrefixLength(e.target.value)}
                        placeholder="24"
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="dhcp-enabled"
                      checked={dhcpEnabled}
                      onChange={(e) => setDhcpEnabled(e.target.checked)}
                    />
                    <Label htmlFor="dhcp-enabled">Enable DHCP</Label>
                  </div>
                  
                  {dhcpEnabled && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="dhcp-start">DHCP Start</Label>
                        <Input
                          id="dhcp-start"
                          value={dhcpStart}
                          onChange={(e) => setDhcpStart(e.target.value)}
                          placeholder="192.168.100.10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dhcp-end">DHCP End</Label>
                        <Input
                          id="dhcp-end"
                          value={dhcpEnd}
                          onChange={(e) => setDhcpEnd(e.target.value)}
                          placeholder="192.168.100.254"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsCreateNetworkOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={async () => {
                  if (!networkName.trim()) {
                    toast({
                      title: "Error",
                      description: "Network name is required",
                      variant: "destructive",
                    })
                    return
                  }
                  
                  try {
                    const response = await fetch('/api/networks', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: networkName,
                        bridgeName: `virbr-${networkName}`
                      })
                    })
                    
                    if (!response.ok) {
                      throw new Error('Failed to create network')
                    }
                    
                    toast({
                      title: "Success",
                      description: `Virtual network "${networkName}" created successfully`,
                    })
                    
                    // Refresh the network list
                    const networks = await networkAPI.getNetworks()
                    setVirtualNetworks(networks)
                    
                    // Reset form and close dialog
                    setNetworkName("")
                    setIsCreateNetworkOpen(false)
                  } catch (error) {
                    toast({
                      title: "Error",
                      description: `Failed to create network: ${error instanceof Error ? error.message : 'Unknown error'}`,
                      variant: "destructive",
                    })
                  }
                }}>
                  Create Network
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className={SPACING.section}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">{t('networking.overview')}</TabsTrigger>
          <TabsTrigger value="physical">{t('networking.physical')}</TabsTrigger>
          <TabsTrigger value="virtual">{t('networking.virtual')}</TabsTrigger>
          <TabsTrigger value="bridges">{t('networking.bridges')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className={SPACING.section}>
          {/* Network Statistics Cards */}
          <div className={`${GRIDS.fourCol} ${SPACING.grid}`}>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('networking.totalInterfaces')}</p>
                    <p className="text-2xl font-bold">{systemInterfaces.length}</p>
                  </div>
                  <Network className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('networking.activeInterfaces')}</p>
                    <p className="text-2xl font-bold text-green-600">
                      {systemInterfaces.filter(i => i.state === 'up').length}
                    </p>
                  </div>
                  <Activity className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('networking.bridgeInterfaces')}</p>
                    <p className="text-2xl font-bold">{bridgeInterfaces.length}</p>
                  </div>
                  <Router className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('networking.virtualNetworks')}</p>
                    <p className="text-2xl font-bold">{virtualNetworks.length}</p>
                  </div>
                  <Wifi className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* All Interfaces Table */}
          <Card>
            <CardHeader>
              <CardTitle>{t('networking.systemNetworkInterfaces')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">{t('networking.interface')}</TableHead>
                    <TableHead className="px-4">{t('networking.type')}</TableHead>
                    <TableHead className="px-4">{t('networking.status')}</TableHead>
                    <TableHead className="px-4">{t('networking.ipAddress')}</TableHead>
                    <TableHead className="px-4">{t('networking.speed')}</TableHead>
                    <TableHead className="px-4">{t('networking.rxTx')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {systemInterfaces.map((iface) => (
                    <TableRow key={iface.name} className="hover:bg-muted/50">
                      <TableCell className="px-4">
                        <div className="flex items-center gap-2">
                          {getInterfaceIcon(iface.type)}
                          <span className="font-mono">{iface.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 capitalize">{iface.type}</TableCell>
                      <TableCell className="px-4">{getStatusBadge(iface.state)}</TableCell>
                      <TableCell className="px-4 font-mono">
                        {iface.ip_addresses && Array.isArray(iface.ip_addresses) && iface.ip_addresses.length > 0 ? iface.ip_addresses[0] : 'No IP'}
                      </TableCell>
                      <TableCell className="px-4">{iface.speed}</TableCell>
                      <TableCell className="px-4">
                        <div className="text-xs">
                          <div className="flex items-center gap-1">
                            <ArrowUpDown className="h-3 w-3" />
                            {formatSpeed(iface.rx_bytes)} / {formatSpeed(iface.tx_bytes)}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="physical" className={SPACING.section}>
          <Card>
            <CardHeader>
              <CardTitle>{t('networking.physicalNetworkInterfaces')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">{t('networking.interface')}</TableHead>
                    <TableHead className="px-4">{t('networking.status')}</TableHead>
                    <TableHead className="px-4">{t('networking.ipAddress')}</TableHead>
                    <TableHead className="px-4">{t('networking.macAddress')}</TableHead>
                    <TableHead className="px-4">{t('networking.speed')}</TableHead>
                    <TableHead className="px-4">{t('networking.mtu')}</TableHead>
                    <TableHead className="px-4">{t('networking.traffic')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {physicalInterfaces.map((iface) => (
                    <TableRow key={iface.name} className="hover:bg-muted/50">
                      <TableCell className="px-4">
                        <div className="flex items-center gap-2">
                          {getInterfaceIcon(iface.type)}
                          <span className="font-mono font-medium">{iface.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4">{getStatusBadge(iface.state)}</TableCell>
                      <TableCell className="px-4 font-mono">
                        {iface.ip_addresses && Array.isArray(iface.ip_addresses) && iface.ip_addresses.length > 0 ? iface.ip_addresses.join(', ') : 'No IP'}
                      </TableCell>
                      <TableCell className="px-4 font-mono text-xs">{iface.mac_address}</TableCell>
                      <TableCell className="px-4">{iface.speed}</TableCell>
                      <TableCell className="px-4">{iface.mtu}</TableCell>
                      <TableCell className="px-4">
                        <div className="text-xs space-y-1">
                          <div>RX: {formatBytes(iface.rx_bytes)}</div>
                          <div>TX: {formatBytes(iface.tx_bytes)}</div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="virtual" className={SPACING.section}>
          <Card>
            <CardHeader>
              <CardTitle>{t('networking.virtualNetworkInterfaces')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">{t('networking.interface')}</TableHead>
                    <TableHead className="px-4">{t('networking.type')}</TableHead>
                    <TableHead className="px-4">{t('networking.status')}</TableHead>
                    <TableHead className="px-4">{t('networking.macAddress')}</TableHead>
                    <TableHead className="px-4">{t('networking.traffic')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {virtualInterfaces.map((iface) => (
                    <TableRow key={iface.name} className="hover:bg-muted/50">
                      <TableCell className="px-4">
                        <div className="flex items-center gap-2">
                          {getInterfaceIcon(iface.type)}
                          <span className="font-mono font-medium">{iface.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 capitalize">{iface.type}</TableCell>
                      <TableCell className="px-4">{getStatusBadge(iface.state)}</TableCell>
                      <TableCell className="px-4 font-mono text-xs">{iface.mac_address}</TableCell>
                      <TableCell className="px-4">
                        <div className="text-xs space-y-1">
                          <div>RX: {formatBytes(iface.rx_bytes)}</div>
                          <div>TX: {formatBytes(iface.tx_bytes)}</div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bridges" className={SPACING.section}>
          <Card>
            <CardHeader>
              <CardTitle>{t('networking.bridgeNetworkInterfaces')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">{t('networking.bridge')}</TableHead>
                    <TableHead className="px-4">{t('networking.status')}</TableHead>
                    <TableHead className="px-4">{t('networking.ipAddress')}</TableHead>
                    <TableHead className="px-4">{t('networking.macAddress')}</TableHead>
                    <TableHead className="px-4">{t('networking.traffic')}</TableHead>
                    <TableHead className="px-4">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bridgeInterfaces.map((iface) => (
                    <TableRow key={iface.name} className="hover:bg-muted/50">
                      <TableCell className="px-4">
                        <div className="flex items-center gap-2">
                          <Router className="h-4 w-4" />
                          <span className="font-mono font-medium">{iface.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4">{getStatusBadge(iface.state)}</TableCell>
                      <TableCell className="px-4 font-mono">
                        {iface.ip_addresses && Array.isArray(iface.ip_addresses) && iface.ip_addresses.length > 0 ? iface.ip_addresses.join(', ') : 'No IP'}
                      </TableCell>
                      <TableCell className="px-4 font-mono text-xs">{iface.mac_address}</TableCell>
                      <TableCell className="px-4">
                        <div className="text-xs space-y-1">
                          <div>RX: {formatBytes(iface.rx_bytes)}</div>
                          <div>TX: {formatBytes(iface.tx_bytes)}</div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4">
                        <Button variant="ghost" size="sm">
                          <Settings className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}