"use client"

import React, { createContext, useContext, useState, useEffect } from 'react'
import { Locale, defaultLocale, getTranslations } from '@/lib/i18n'

interface I18nContextType {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string) => string
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

export function I18nProvider({ 
  children, 
  initialLocale = defaultLocale 
}: { 
  children: React.ReactNode
  initialLocale?: Locale 
}) {
  const [locale, setLocale] = useState<Locale>('zh')
  const [translations, setTranslations] = useState(getTranslations('zh'))
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    setTranslations(getTranslations(locale))
    // Store locale preference
    if (typeof window !== 'undefined') {
      localStorage.setItem('locale', locale)
      console.log('Locale changed to:', locale)
    }
  }, [locale])

  useEffect(() => {
    // Load locale preference from localStorage only once
    if (typeof window !== 'undefined' && !isInitialized) {
      const savedLocale = localStorage.getItem('locale') as Locale
      if (savedLocale && (savedLocale === 'en' || savedLocale === 'zh')) {
        console.log('Loading saved locale:', savedLocale)
        setLocale(savedLocale)
        setTranslations(getTranslations(savedLocale))
      } else {
        // Set default to Chinese if no saved preference
        console.log('Setting default locale to Chinese')
        setLocale('zh')
        setTranslations(getTranslations('zh'))
        localStorage.setItem('locale', 'zh')
      }
      setIsInitialized(true)
    }
  }, [isInitialized])

  const t = (key: string): string => {
    const keys = key.split('.')
    let value: any = translations
    
    for (const k of keys) {
      value = value?.[k]
    }
    
    return value || key
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useTranslation() {
  const context = useContext(I18nContext)
  if (context === undefined) {
    throw new Error('useTranslation must be used within an I18nProvider')
  }
  return context
}
