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
  const [locale, setLocale] = useState<Locale>(() => {
    // Try to get saved locale immediately during initialization
    if (typeof window !== 'undefined') {
      const savedLocale = localStorage.getItem('locale') as Locale
      if (savedLocale && (savedLocale === 'en' || savedLocale === 'zh')) {
        return savedLocale
      }
    }
    return defaultLocale
  })
  const [translations, setTranslations] = useState(() => {
    // Initialize translations based on the determined locale
    if (typeof window !== 'undefined') {
      const savedLocale = localStorage.getItem('locale') as Locale
      if (savedLocale && (savedLocale === 'en' || savedLocale === 'zh')) {
        return getTranslations(savedLocale)
      }
    }
    return getTranslations(defaultLocale)
  })
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
    // Ensure localStorage is updated on first load if no preference was saved
    if (typeof window !== 'undefined' && !isInitialized) {
      const savedLocale = localStorage.getItem('locale')
      if (!savedLocale) {
        console.log('No saved locale found, setting to current locale:', locale)
        localStorage.setItem('locale', locale)
      } else {
        console.log('Loaded saved locale:', savedLocale)
      }
      setIsInitialized(true)
    }
  }, [isInitialized, locale])

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
