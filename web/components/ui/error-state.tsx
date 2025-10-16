/**
 * Standardized Error State Component
 * Ensures consistent error positioning across all pages
 */

import { AlertCircle, RefreshCw } from "lucide-react"
import { ConsistentButton } from "./consistent-button"
import { SPACING, TYPOGRAPHY } from "@/lib/ui-constants"
import { refreshPage } from "@/lib/navigation"
import { useTranslation } from "@/components/i18n-provider"

interface ErrorStateProps {
  title?: string
  description?: string
  showRefresh?: boolean
  onRetry?: () => void
  className?: string
}

export function ErrorState({ 
  title = "Something went wrong",
  description,
  showRefresh = true,
  onRetry,
  className = ""
}: ErrorStateProps) {
  const { t } = useTranslation()
  const handleRetry = () => {
    if (onRetry) {
      onRetry()
    } else {
      refreshPage()
    }
  }

  return (
    <div className={`flex items-center justify-center min-h-[400px] ${className}`}>
      <div className="text-center max-w-md mx-auto px-4">
        <div className="mb-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        </div>
        <h2 className={`${TYPOGRAPHY.sectionTitle} text-destructive mb-2`}>
          {title}
        </h2>
        {description && (
          <p className="text-muted-foreground mb-6">
            {description}
          </p>
        )}
        {showRefresh && (
          <ConsistentButton 
            variant="outline" 
            onClick={handleRetry}
            icon={<RefreshCw className="h-4 w-4" />}
          >
            {t('images.tryAgain')}
          </ConsistentButton>
        )}
      </div>
    </div>
  )
}