import en from '../public/locales/en/common.json'
import zh from '../public/locales/zh/common.json'

export const locales = ['en', 'zh'] as const
export type Locale = typeof locales[number]

export const defaultLocale: Locale = 'zh'

const translations = {
  en,
  zh,
} as const

export function getTranslations(locale: Locale) {
  return translations[locale] || translations[defaultLocale]
}

export function t(key: string, locale: Locale = defaultLocale): string {
  const keys = key.split('.')
  let value: any = getTranslations(locale)
  
  for (const k of keys) {
    value = value?.[k]
  }
  
  return value || key
}
