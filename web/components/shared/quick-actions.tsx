"use client"

import type React from "react"
import { navigateTo, routes } from "@/lib/navigation"
import { useTranslation } from "@/components/i18n-provider"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, HardDrive, Network, TrendingUp } from "lucide-react"

interface QuickAction {
  label: string
  icon: React.ReactNode
  onClick: () => void
}

interface QuickActionsProps {
  actions?: QuickAction[]
  title?: string
}



export function QuickActions({ actions, title }: QuickActionsProps) {
  const { t } = useTranslation()
  const displayTitle = title || t('vm.quickActions')

  const handleAction = (action: QuickAction) => {
    action.onClick()
  }

  const finalActions = actions || [
    {
      label: t('vm.createNewVM'),
      icon: <Plus className="mr-2 h-4 w-4" />,
      onClick: () => navigateTo(routes.vmCreate),
    },
    {
      label: t('vm.addStoragePool'),
      icon: <HardDrive className="mr-2 h-4 w-4" />,
      onClick: () => navigateTo(routes.storage),
    },
    {
      label: t('vm.configureNetwork'),
      icon: <Network className="mr-2 h-4 w-4" />,
      onClick: () => navigateTo(routes.networking),
    },
    {
      label: t('vm.viewPerformance'),
      icon: <TrendingUp className="mr-2 h-4 w-4" />,
      onClick: () => navigateTo(routes.analytics),
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{displayTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {finalActions.map((action, index) => (
          <Button
            key={index}
            variant="outline"
            className="w-full justify-start bg-transparent"
            onClick={() => handleAction(action)}
          >
            {action.icon}
            {action.label}
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}
