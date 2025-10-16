"use client"

import type React from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Activity, Clock, Square, RotateCcw, Play, Monitor, Loader2 } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { useTranslation } from "@/components/i18n-provider"

interface VirtualMachine {
  id: number
  name: string
  status: "running" | "stopped" | "paused"
  cpu: number
  memory: { used: number; total: number }
  uptime: string
  os: string
  ip: string
}

interface VMCardProps {
  vm: VirtualMachine
  onAction?: (action: string, vmId: number) => void
}

export function VMCard({ vm, onAction }: VMCardProps) {
  const { t } = useTranslation()
  const [isActionLoading, setIsActionLoading] = useState(false)

  const handleAction = async (action: string, vmId: number) => {
    setIsActionLoading(true)
    try {
      await onAction?.(action, vmId)
    } finally {
      setIsActionLoading(false)
    }
  }

  const getStatusBadge = () => {
    const baseClasses = "flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 shadow-sm"

    switch (vm.status) {
      case "running":
        return (
          <Badge variant="default" className={cn(baseClasses, "bg-primary text-primary-foreground border-primary/20 hover:bg-primary/90 transition-colors duration-150 animate-fade-scale")}>
            <Activity className="h-3 w-3" />
            <span>{t('vm.running')}</span>
          </Badge>
        )
      case "paused":
        return (
          <Badge variant="secondary" className={cn(baseClasses, "bg-accent text-accent-foreground border-accent/20 hover:bg-accent/90 transition-colors duration-150 animate-fade-scale")}>
            <Clock className="h-3 w-3" />
            <span>{t('vm.paused')}</span>
          </Badge>
        )
      default: // stopped
        return (
          <Badge variant="secondary" className={cn(baseClasses, "bg-muted text-muted-foreground border-border/50 hover:bg-muted/80 transition-colors duration-150 animate-fade-scale")}>
            <Square className="h-3 w-3" />
            <span>{t('vm.stopped')}</span>
          </Badge>
        )
    }
  }

  const renderActionButtons = () => {
    if (vm.status === "running") {
      return (
        <>
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "flex-1 transition-all duration-200 hover-premium hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30 focus-premium active:scale-95",
              "border-border/50 bg-surface-2 shadow-sm"
            )}
            onClick={(e) => {
              e.stopPropagation()
              handleAction("stop", vm.id)
            }}
            title="Stop VM"
            disabled={isActionLoading}
          >
            {isActionLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Square className="h-3 w-3" />
            )}
            <span className="sr-only">Stop</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "flex-1 transition-all duration-200 hover-premium hover:bg-accent/10 hover:text-accent-foreground focus-premium active:scale-95",
              "border-border/50 bg-surface-2 shadow-sm"
            )}
            onClick={(e) => {
              e.stopPropagation()
              handleAction("reboot", vm.id)
            }}
            title="Reboot VM"
            disabled={isActionLoading}
          >
            {isActionLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
            <span className="sr-only">Reboot</span>
          </Button>
        </>
      )
    } else {
      return (
        <Button
          size="sm"
          variant="outline"
          className={cn(
            "flex-1 transition-all duration-200 hover-premium hover:bg-primary/5 hover:text-primary hover:border-primary/30 focus-premium active:scale-95",
            "border-border/50 bg-surface-2 shadow-sm"
          )}
          onClick={(e) => {
            e.stopPropagation()
            handleAction("start", vm.id)
          }}
          title="Start VM"
          disabled={isActionLoading}
        >
          {isActionLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Play className="h-3 w-3" />
          )}
          <span className="sr-only">Start</span>
        </Button>
      )
    }
  }

  return (
    <Card className={cn(
      "group transition-all duration-300 ease-out hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 cursor-pointer animate-fade-in",
      "bg-card border-border/50 shadow-sm overflow-hidden",
      vm.status === "running" ? "border-primary/20 bg-surface-1" : vm.status === "paused" ? "border-accent/20 bg-surface-1" : "border-muted/30 bg-surface-3"
    )}>
      <CardHeader className="pb-3 px-4 sm:px-6 pt-4">
        <div className="flex items-start justify-between gap-3 min-w-0">
          <CardTitle className="text-base sm:text-lg font-display font-semibold truncate flex-1 min-w-0 group-hover:text-primary transition-colors duration-200">
            {vm.name}
          </CardTitle>
          <div className="flex-shrink-0">
            {getStatusBadge()}
          </div>
        </div>
        <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
          <div className="truncate font-mono">{vm.os}</div>
          <div className="font-mono text-xs opacity-80">{vm.ip}</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-4 sm:px-6 pb-4">
        <div className="space-y-2">
          <div className="flex justify-between text-xs sm:text-sm">
            <span className="text-muted-foreground font-medium">{t('vm.cpu')}</span>
            <span className="font-semibold tabular-nums text-foreground">{vm.cpu}%</span>
          </div>
          <Progress
            value={vm.cpu}
            className="h-1.5 transition-all duration-500 ease-out"
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs sm:text-sm">
            <span className="text-muted-foreground font-medium">{t('common.memory')}</span>
            <span className="font-semibold tabular-nums text-foreground">
              {vm.memory.used}GB / {vm.memory.total}GB
            </span>
          </div>
          <Progress
            value={(vm.memory.used / vm.memory.total) * 100}
            className="h-1.5 transition-all duration-500 ease-out"
          />
        </div>

        <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t border-border/30">
          <span>
            {t('vm.uptime')}: <span className="tabular-nums font-medium">{vm.uptime}</span>
          </span>
        </div>

        <div className="flex gap-2 pt-3">
          {renderActionButtons()}
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "flex-1 transition-all duration-200 hover-premium hover:bg-accent/10 hover:text-accent-foreground focus-premium active:scale-95",
              "border-border/50 bg-surface-2 shadow-sm"
            )}
            onClick={(e) => {
              e.stopPropagation()
              handleAction("console", vm.id)
            }}
            title="Open Console"
            disabled={isActionLoading}
          >
            {isActionLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Monitor className="h-3 w-3" />
            )}
            <span className="sr-only">Console</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
