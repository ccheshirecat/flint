"use client"

import { useState, useEffect } from "react"
import { useTranslation } from "@/components/i18n-provider"
import { navigateTo, routes } from "@/lib/navigation"
import { SPACING, TYPOGRAPHY, TRANSITIONS } from "@/lib/ui-constants"
import { ConsistentButton } from "@/components/ui/consistent-button"
import { storageAPI, networkAPI, imageAPI, Image } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useToast } from "@/components/ui/use-toast"
import { LiveConsoleFeed } from "@/components/live-console-feed"
import { VMTemplates } from "@/components/vm-templates"
import {
  ArrowLeft,
  Zap,
  ImageIcon,
  Loader2,
  ExternalLink,
  Copy,
  Plus,
} from "lucide-react"

interface SimpleVMConfig {
  name: string
  sourceType: "iso" | "cloud"
  selectedSource: string
  vcpus: number
  memory: number
  diskSize: number
  storagePool: string
  network: string
  enableCloudInit: boolean
  hostname: string
  username: string
  password: string
  sshKeys: string
  networkType: "dhcp" | "static"
  staticIP: string
  gateway: string
  dnsServers: string
}

export function SimpleVMWizard() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [isCreating, setIsCreating] = useState(false)
  const [createdVM, setCreatedVM] = useState<{ uuid: string; name: string } | null>(null)
  const [vmIP, setVmIP] = useState<string | null>(null)
  const [sshReady, setSSHReady] = useState(false)
  const [config, setConfig] = useState<SimpleVMConfig>({
    name: "",
    sourceType: "cloud",
    selectedSource: "",
    vcpus: 2,
    memory: 4096,
    diskSize: 20,
    storagePool: "default",
    network: "default",
    enableCloudInit: true,
    hostname: "",
    username: "ubuntu",
    password: "",
    sshKeys: "",
    networkType: "dhcp",
    staticIP: "",
    gateway: "",
    dnsServers: "8.8.8.8, 1.1.1.1",
  })

  const [storagePools, setStoragePools] = useState<any[]>([])
  const [virtualNetworks, setVirtualNetworks] = useState<any[]>([])
  const [systemInterfaces, setSystemInterfaces] = useState<any[]>([])
  const [allNetworks, setAllNetworks] = useState<any[]>([])
  const [images, setImages] = useState<Image[]>([])

  const updateConfig = (updates: Partial<SimpleVMConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }))
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pools, nets, interfaces, imgs] = await Promise.all([
          storageAPI.getPools(),
          networkAPI.getNetworks(),
          networkAPI.getSystemInterfaces(),
          imageAPI.getAll()
        ])
        
        setStoragePools(pools || [])
        setVirtualNetworks(nets || [])
        setSystemInterfaces(interfaces || [])
        setImages(imgs || [])
        
        // Combine virtual networks and system interfaces for network selection
        const combinedNetworks = [
          ...(nets || []).map(n => ({
            name: n.name,
            type: 'virtual-network',
            description: n.is_active ? 'Active virtual network' : 'Inactive virtual network',
            status: n.is_active ? 'active' : 'inactive'
          })),
          ...(interfaces || []).filter(iface => 
            iface.type === 'bridge' || iface.type === 'physical'
          ).map(iface => ({
            name: iface.name,
            type: iface.type,
            description: `${iface.type} interface${iface.ip_addresses && Array.isArray(iface.ip_addresses) && iface.ip_addresses.length > 0 ? ` (${iface.ip_addresses[0]})` : ''}`,
            status: iface.state
          }))
        ]
        setAllNetworks(combinedNetworks)
        
        // Auto-select first available options
        if (pools && pools.length > 0) updateConfig({ storagePool: pools[0].name })
        if (combinedNetworks.length > 0) updateConfig({ network: combinedNetworks[0].name })
        
        // Auto-detect SSH key from common locations
        autoDetectSSHKey()
      } catch (err) {
        console.error('Failed to fetch data:', err)
      }
    }
    fetchData()
  }, [])

  const autoDetectSSHKey = async () => {
    try {
      // Try to read SSH public key from common locations
      const response = await fetch('/api/ssh-key/detect')
      if (response.ok) {
        const { publicKey } = await response.json()
        if (publicKey) {
          updateConfig({ sshKeys: publicKey })
          toast({
            title: t('vm.sshKeyDetected'),
            description: t('vm.autoFilledSSHKey'),
          })
        }
      }
    } catch (err) {
      // Silent fail - SSH key detection is optional
    }
  }

  const formatSize = (bytes: number) => {
    const gb = bytes / 1024 / 1024 / 1024
    return `${gb.toFixed(1)}GB`
  }

  const handleCreate = async () => {
    if (!config.name.trim() || !config.selectedSource) {
      toast({
        title: t('vm.missingInformation'),
        description: t('vm.fillInRequiredFields'),
        variant: "destructive",
      })
      return
    }

    setIsCreating(true)
    try {
      const formData = {
        Name: config.name,
        MemoryMB: config.memory,
        VCPUs: config.vcpus,
        DiskPool: config.storagePool,
        DiskSizeGB: config.diskSize,
        ISOPath: config.sourceType === 'iso' ? config.selectedSource : '',
        imageName: config.sourceType === 'cloud' ? config.selectedSource : '',
        imageType: config.sourceType === 'cloud' ? 'template' : 'iso',
        enableCloudInit: config.enableCloudInit,
        cloudInit: config.enableCloudInit ? {
          commonFields: {
            hostname: config.hostname || config.name,
            username: config.username,
            password: config.password,
            sshKeys: config.sshKeys,
            networkConfig: {
              useDHCP: config.networkType === "dhcp",
              ipAddress: config.networkType === "static" ? config.staticIP : "",
              gateway: config.networkType === "static" ? config.gateway : "",
              dnsServers: config.networkType === "static" ? config.dnsServers.split(',').map(dns => dns.trim()) : []
            }
          },
          rawUserData: ""
        } : null,
        StartOnCreate: true,
        NetworkName: config.network,
      }

      const response = await fetch('/api/vms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || t('vm.failedToCreateVM'))
      }

      const newVM = await response.json()
      
      setCreatedVM({ uuid: newVM.uuid, name: config.name })
      
      toast({
        title: t('vm.vmCreatedSuccessfully'),
        description: `${config.name} ${t('vm.vmBootingUp')}`,
      })
    } catch (error) {
      console.error("VM creation failed:", error)
      toast({
        title: t('vm.creationFailed'),
        description: error instanceof Error ? error.message : t('vm.failedToCreateVM'),
        variant: "destructive",
      })
    } finally {
      setIsCreating(false)
    }
  }

  const cloudImages = (images || []).filter(img => img.type === "template")
  const isoImages = (images || []).filter(img => img.type === "iso")

  const handleSSHReady = (ip: string) => {
    setVmIP(ip)
    setSSHReady(true)
    toast({
      title: `🎉 ${t('vm.sshReady')}`,
      description: `${t('vm.vmReadyAtIP')} ${ip}`,
    })
  }

  const copySSHCommand = () => {
    if (!vmIP) return
    const command = `ssh ubuntu@${vmIP}`
    navigator.clipboard.writeText(command)
    toast({
      title: t('vm.sshCommandCopied'),
      description: `${t('vm.copied')}: ${command}`,
    })
  }

  const goToVMDetail = () => {
    if (createdVM) {
      navigateTo(routes.vmDetail(createdVM.uuid))
    }
  }

  // If VM is created, show the live console and SSH ready state
  if (createdVM) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 p-6 sm:p-8 lg:p-10">
        <div className="flex items-center gap-4">
          <ConsistentButton 
            variant="ghost" 
            size="sm"
            onClick={() => navigateTo(routes.vms)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('vm.backToVMs')}
          </ConsistentButton>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('vm.vmCreated')}: {createdVM.name}</h1>
            <p className="text-muted-foreground">{t('vm.watchVMBoot')}</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Live Console Feed */}
          <div className="lg:col-span-1">
            <LiveConsoleFeed 
              vmId={createdVM.uuid} 
              vmName={createdVM.name}
              onSSHReady={handleSSHReady}
            />
          </div>

          {/* SSH Ready Panel */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('vm.connectionStatus')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {sshReady && vmIP ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="font-medium text-green-700">{t('vm.sshReady')}!</span>
                    </div>
                    
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm font-medium text-green-800 mb-2">Your VM is ready to use:</p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-green-600">IP Address:</span>
                          <code className="text-sm font-mono bg-green-100 px-2 py-1 rounded">{vmIP}</code>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-green-600">Username:</span>
                          <code className="text-sm font-mono bg-green-100 px-2 py-1 rounded">ubuntu</code>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <ConsistentButton onClick={copySSHCommand} className="flex-1">
                        <Copy className="mr-2 h-4 w-4" />
                        Copy SSH Command
                      </ConsistentButton>
                      <ConsistentButton variant="outline" onClick={goToVMDetail}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        VM Details
                      </ConsistentButton>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      <span className="text-muted-foreground">VM is booting...</span>
                    </div>
                    
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">
                        Your VM is starting up. This usually takes 30-60 seconds for cloud images.
                        Watch the console output for progress.
                      </p>
                    </div>

                    <ConsistentButton variant="outline" onClick={goToVMDetail} className="w-full">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Go to VM Details
                    </ConsistentButton>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <ConsistentButton 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => {
                    setCreatedVM(null)
                    setVmIP(null)
                    setSSHReady(false)
                    updateConfig({ name: "", selectedSource: "" })
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Another VM
                </ConsistentButton>
                <ConsistentButton 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => navigateTo(routes.vms)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  View All VMs
                </ConsistentButton>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6 sm:p-8 lg:p-10">
      {/* Header */}
      <div className="flex items-center gap-4">
        <ConsistentButton 
          variant="ghost" 
          size="sm"
          onClick={() => navigateTo(routes.vms)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('vm.backToVMs')}
        </ConsistentButton>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('vm.createVirtualMachine')}</h1>
          <p className="text-muted-foreground">{t('vm.quickSetup')}</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left Column - Main Config */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('vm.basicConfiguration')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="vm-name">{t('vm.vmName')} *</Label>
                <Input
                  id="vm-name"
                  placeholder={t('vm.vmNamePlaceholder')}
                  value={config.name}
                  onChange={(e) => updateConfig({ name: e.target.value })}
                />
              </div>

              <div className="space-y-3">
                <Label>{t('vm.installationSource')} *</Label>
                <RadioGroup
                  value={config.sourceType}
                  onValueChange={(value) => updateConfig({ 
                    sourceType: value as any, 
                    selectedSource: "",
                    enableCloudInit: value === "cloud"
                  })}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`flex items-center space-x-3 rounded-lg border-2 p-3 cursor-pointer ${
                      config.sourceType === "cloud" 
                        ? "border-primary bg-primary/10" 
                        : "border-muted hover:border-accent"
                    }`}
                    onClick={() => updateConfig({ sourceType: "cloud", selectedSource: "", enableCloudInit: true })}>
                      <RadioGroupItem value="cloud" id="cloud" />
                      <div className="flex-1">
                        <Label htmlFor="cloud" className="font-medium cursor-pointer">
                          {t('vm.cloudImage')}
                        </Label>
                        <p className="text-xs text-muted-foreground">{t('vm.readyToUse')}</p>
                      </div>
                    </div>

                    <div className={`flex items-center space-x-3 rounded-lg border-2 p-3 cursor-pointer ${
                      config.sourceType === "iso" 
                        ? "border-primary bg-primary/10" 
                        : "border-muted hover:border-accent"
                    }`}
                    onClick={() => updateConfig({ sourceType: "iso", selectedSource: "", enableCloudInit: false })}>
                      <RadioGroupItem value="iso" id="iso" />
                      <div className="flex-1">
                        <Label htmlFor="iso" className="font-medium cursor-pointer">
                          {t('vm.isoImage')}
                        </Label>
                        <p className="text-xs text-muted-foreground">{t('vm.manualInstallation')}</p>
                      </div>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              {config.sourceType === "cloud" && (
                <div className="space-y-2">
                  <Label>{t('vm.selectCloudImage')}</Label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {cloudImages && cloudImages.length > 0 ? (
                      cloudImages.map((image) => (
                        <div
                          key={image.id}
                          className={`cursor-pointer rounded-lg border p-3 transition-all ${
                            config.selectedSource === image.name 
                              ? "border-primary bg-primary/10" 
                              : "border-muted hover:border-accent hover:bg-muted/50"
                          }`}
                          onClick={() => updateConfig({ selectedSource: image.name })}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm">{image.name}</p>
                              <p className="text-xs text-muted-foreground">{image.os_info || t('vm.cloudImage')}</p>
                            </div>
                            <Badge variant="outline" className="text-xs">{formatSize(image.size_b)}</Badge>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4 text-muted-foreground text-sm">
                        No cloud images available. 
                        <ConsistentButton variant="link" className="p-0 h-auto ml-1" onClick={() => navigateTo(routes.images)}>
                          Upload images here
                        </ConsistentButton>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {config.sourceType === "iso" && (
                <div className="space-y-2">
                  <Label>Select ISO Image</Label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {isoImages && isoImages.length > 0 ? (
                      isoImages.map((image) => (
                        <div
                          key={image.id}
                          className={`cursor-pointer rounded-lg border p-3 transition-all ${
                            config.selectedSource === image.name 
                              ? "border-primary bg-primary/10" 
                              : "border-muted hover:border-accent hover:bg-muted/50"
                          }`}
                          onClick={() => updateConfig({ selectedSource: image.name })}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm">{image.name}</p>
                              <p className="text-xs text-muted-foreground">{image.os_info || "ISO Image"}</p>
                            </div>
                            <Badge variant="outline" className="text-xs">{formatSize(image.size_b)}</Badge>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4 text-muted-foreground text-sm">
                        No ISO images available
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {config.enableCloudInit && (
            <Card>
              <CardHeader>
                <CardTitle>Cloud-Init Setup</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="hostname">Hostname</Label>
                    <Input
                      id="hostname"
                      placeholder={config.name || "my-vm"}
                      value={config.hostname || config.name}
                      onChange={(e) => updateConfig({ hostname: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">Auto-filled from VM name</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        placeholder="ubuntu"
                        value={config.username}
                        onChange={(e) => updateConfig({ username: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="Enter password"
                        value={config.password}
                        onChange={(e) => updateConfig({ password: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ssh-keys">SSH Public Keys (one per line)</Label>
                    <textarea
                      id="ssh-keys"
                      className="w-full min-h-[80px] px-3 py-2 text-sm border border-input rounded-md bg-background"
                      placeholder="ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ..."
                      value={config.sshKeys}
                      onChange={(e) => updateConfig({ sshKeys: e.target.value })}
                    />
                  </div>

                  <div className="space-y-3">
                    <Label>Network Configuration</Label>
                    <RadioGroup
                      value={config.networkType}
                      onValueChange={(value) => updateConfig({ networkType: value as "dhcp" | "static" })}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="dhcp" id="dhcp" />
                        <Label htmlFor="dhcp">DHCP (Automatic)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="static" id="static" />
                        <Label htmlFor="static">Static IP</Label>
                      </div>
                    </RadioGroup>

                    {config.networkType === "static" && (
                      <div className="space-y-3 p-3 border rounded-lg bg-muted/20">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label htmlFor="static-ip">IP Address</Label>
                            <Input
                              id="static-ip"
                              placeholder="192.168.1.100"
                              value={config.staticIP}
                              onChange={(e) => updateConfig({ staticIP: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="gateway">Gateway</Label>
                            <Input
                              id="gateway"
                              placeholder="192.168.1.1"
                              value={config.gateway}
                              onChange={(e) => updateConfig({ gateway: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="dns">DNS Servers (comma-separated)</Label>
                          <Input
                            id="dns"
                            placeholder="8.8.8.8, 1.1.1.1"
                            value={config.dnsServers}
                            onChange={(e) => updateConfig({ dnsServers: e.target.value })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Resources & Templates */}
        <div className="space-y-6">
          <VMTemplates onLaunchFromTemplate={(templateId, vmName) => {
            toast({
              title: "Launching from Template", 
              description: `Creating ${vmName} from template...`,
            })
          }} />
          <Card>
            <CardHeader>
              <CardTitle>Resources</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vcpus">vCPUs</Label>
                  <Input
                    id="vcpus"
                    type="number"
                    min="1"
                    max="32"
                    value={config.vcpus}
                    onChange={(e) => updateConfig({ vcpus: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="memory">Memory (MB)</Label>
                  <Input
                    id="memory"
                    type="number"
                    min="512"
                    step="512"
                    value={config.memory}
                    onChange={(e) => updateConfig({ memory: parseInt(e.target.value) || 2048 })}
                  />
                  <p className="text-xs text-muted-foreground">{(config.memory/1024).toFixed(1)}GB</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="disk-size">Disk Size (GB)</Label>
                <Input
                  id="disk-size"
                  type="number"
                  min="10"
                  value={config.diskSize}
                  onChange={(e) => updateConfig({ diskSize: parseInt(e.target.value) || 50 })}
                />
              </div>

              <div className="space-y-2">
                <Label>Storage Pool</Label>
                <Select
                  value={config.storagePool}
                  onValueChange={(value) => updateConfig({ storagePool: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(storagePools || []).map((pool) => (
                      <SelectItem key={pool.name} value={pool.name}>
                        {pool.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Network</Label>
                <Select
                  value={config.network}
                  onValueChange={(value) => updateConfig({ network: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(allNetworks || []).map((network) => (
                      <SelectItem key={network.name} value={network.name}>
                        <div className="flex items-center justify-between w-full">
                          <span>{network.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            ({network.type})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{config.name || "Not set"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <span className="font-medium">{config.selectedSource || "Not selected"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Resources</span>
                <span className="font-medium">{config.vcpus} vCPU, {config.memory/1024}GB RAM</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Storage</span>
                <span className="font-medium">{config.diskSize}GB</span>
              </div>
            </CardContent>
          </Card>

          <ConsistentButton 
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 hover-fast shadow-md hover:shadow-lg"
            onClick={handleCreate}
            disabled={isCreating || !config.name.trim() || !config.selectedSource}
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating VM...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Create & Start VM
              </>
            )}
          </ConsistentButton>
        </div>
      </div>
    </div>
  )
}