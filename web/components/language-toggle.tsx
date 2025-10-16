"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Languages } from "lucide-react"
import { useTranslation } from "@/components/i18n-provider"
import { Locale } from "@/lib/i18n"

const languages = [
  { code: 'en' as Locale, name: 'English', flag: '🇺🇸' },
  { code: 'zh' as Locale, name: '中文', flag: '🇨🇳' },
]

export function LanguageToggle() {
  const { locale, setLocale } = useTranslation()

  const handleLanguageChange = (newLocale: Locale) => {
    console.log('Switching language to:', newLocale)
    setLocale(newLocale)
  }

  const currentLanguage = languages.find(lang => lang.code === locale)

  // Simple toggle function - switch between en and zh
  const handleToggle = () => {
    const newLocale = locale === 'zh' ? 'en' : 'zh'
    console.log('Toggling language from', locale, 'to', newLocale)
    setLocale(newLocale)
  }

  return (
    <Button 
      variant="ghost" 
      size="sm" 
      className="h-8 px-2 text-xs hover:bg-accent"
      onClick={handleToggle}
    >
      {currentLanguage?.flag} {currentLanguage?.name || 'zh'}
    </Button>
  )
}
