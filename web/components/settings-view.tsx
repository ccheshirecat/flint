"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useTranslation } from "@/components/i18n-provider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Monitor } from "lucide-react"
import { hostAPI } from "@/lib/api"

interface SystemInfo {
  hostname: string
  cpuCores: number
  totalMemory: string
  storagePath: string
}

export function SettingsView() {
  const { t } = useTranslation()
  const [systemInfo, setSystemInfo] = useState<SystemInfo>({
    hostname: "localhost",
    cpuCores: 0,
    totalMemory: "0 GB",
    storagePath: "/var/lib/libvirt",
  })

  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchSystemInfo = async () => {
      try {
        const status = await hostAPI.getStatus()
        const resources = await hostAPI.getResources()
        
        setSystemInfo({
          hostname: status.hostname || "localhost",
          cpuCores: resources.cpu_cores,
          totalMemory: `${(resources.total_memory_kb / 1024 / 1024).toFixed(1)} GB`,
          storagePath: "/var/lib/libvirt", // Default path
        })
      } catch (error) {
        console.error("Failed to fetch system info:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchSystemInfo()
  }, [])

  if (isLoading) {
    return (
      <div className="container max-w-6xl py-8 px-6 sm:px-8 md:px-10">
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">{t('settings.loadingSystemInfo')}</h2>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container max-w-6xl py-8 px-6 sm:px-8 md:px-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('settings.systemInformation')}</h1>
          <p className="text-muted-foreground mt-1">{t('settings.systemInformationDesc')}</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* System Information */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              {t('settings.systemInformation')}
            </CardTitle>
            <CardDescription>{t('settings.systemInformationDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('settings.hostname')}</Label>
                <Input
                  value={systemInfo.hostname}
                  readOnly
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('settings.cpuCores')}</Label>
                <Input
                  value={systemInfo.cpuCores}
                  readOnly
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('settings.totalMemory')}</Label>
                <Input
                  value={systemInfo.totalMemory}
                  readOnly
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('settings.storagePath')}</Label>
                <Input
                  value={systemInfo.storagePath}
                  readOnly
                  className="bg-muted"
                />
              </div>
              </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
