import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useTranslation } from "@/components/i18n-provider"

interface Activity {
  action: string
  target: string
  time: string
  user: string
}

interface ActivityFeedProps {
  activities: Activity[]
  title?: string
}

export function ActivityFeed({ activities, title }: ActivityFeedProps) {
  const { t } = useTranslation()
  const displayTitle = title || t('vm.recentActivity')
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{displayTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {activities.map((activity, index) => (
          <div key={index}>
            <div className="flex items-start gap-3">
              <div className="h-2 w-2 rounded-full bg-primary mt-2" />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium">{activity.action}</p>
                <p className="text-xs text-muted-foreground">{activity.target}</p>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{activity.time}</span>
                  <span>by {activity.user}</span>
                </div>
              </div>
            </div>
            {index < activities.length - 1 && <Separator className="mt-3" />}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
