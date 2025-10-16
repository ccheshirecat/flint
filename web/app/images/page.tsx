"use client"

import { useState, useEffect } from "react"
import { useTranslation } from "@/components/i18n-provider"
import { AppShell } from "@/components/app-shell"
import { ImagesView } from "@/components/images-view"
import { ImageRepository } from "@/components/image-repository"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { HardDrive, Cloud } from "lucide-react"
import { SPACING, TYPOGRAPHY } from "@/lib/ui-constants"

export default function ImagesPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState("my-images")

  // Handle URL hash for direct navigation
  useEffect(() => {
    const hash = window.location.hash.replace('#', '')
    if (hash === 'repository') {
      setActiveTab('repository')
    } else if (hash === 'my-images') {
      setActiveTab('my-images')
    }
  }, [])

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    // Update URL hash for better navigation
    window.history.replaceState(null, '', `#${value}`)
  }

  return (
    <AppShell>
      <div className={`${SPACING.section} ${SPACING.page}`}>
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className={TYPOGRAPHY.pageTitle}>{t('images.title')}</h1>
            <p className="text-muted-foreground">{t('images.subtitle')}</p>
          </div>
        </div>
        
        <Tabs value={activeTab} onValueChange={handleTabChange} className={SPACING.section}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="my-images" className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            {t('images.myImages')}
          </TabsTrigger>
          <TabsTrigger value="repository" className="flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            {t('images.cloudRepository')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my-images" className={SPACING.section}>
          <ImagesView />
        </TabsContent>

        <TabsContent value="repository" className={SPACING.section}>
          <ImageRepository />
        </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}