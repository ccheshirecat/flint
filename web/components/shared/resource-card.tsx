import type React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { useTranslation } from "@/components/i18n-provider"

interface ResourceCardProps {
  title: string
  value: string | number
  total?: string | number
  percentage?: number
  icon?: React.ReactNode
  trend?: "up" | "down" | "stable"
  trendValue?: string
  className?: string
  children?: React.ReactNode
}

export function ResourceCard({
  title,
  value,
  total,
  percentage,
  icon,
  trend,
  trendValue,
  className,
  children,
}: ResourceCardProps) {
  const { t } = useTranslation()
  return (
    <Card
      className={cn(
        "transition-all duration-300 ease-out hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 animate-fade-in",
        "bg-card border-border/50 shadow-sm overflow-hidden",
        className,
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm sm:text-base font-display font-medium text-muted-foreground truncate pr-2">{title}</CardTitle>
        {icon && <div className="h-4 w-4 text-muted-foreground flex-shrink-0 opacity-80">{icon}</div>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl sm:text-3xl font-display font-bold leading-none text-foreground">
          {value}
          {total && <span className="text-sm sm:text-base text-muted-foreground ml-1">/{total}</span>}
        </div>
        {percentage !== undefined && (
          <div className="space-y-1.5">
            <Progress
              value={percentage}
              className={cn(
                "h-2 transition-all duration-500 ease-out",
                percentage > 80 ? "[&>div]:bg-destructive" : percentage > 60 ? "[&>div]:bg-accent" : "[&>div]:bg-primary"
              )}
            />
            <p className="text-xs text-muted-foreground font-medium">{Math.round(percentage)}% {t('vm.used')}</p>
          </div>
        )}
        {trend && trendValue && (
          <p
            className={cn(
              "text-xs flex items-center gap-1.5 font-medium",
              trend === "up"
                ? "text-primary"
                : trend === "down"
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            <span className="text-sm font-bold">{trend === "up" ? "↗" : trend === "down" ? "↘" : "→"}</span>
            {trendValue}
          </p>
        )}
        {children}
      </CardContent>
    </Card>
  )
}
