// Transaction amounts are major currency units with two decimal places.
export const DEFAULT_CURRENCY_CODE = import.meta.env.VITE_CURRENCY_CODE || 'ETB'
export const CURRENCY_CODE = DEFAULT_CURRENCY_CODE

// Timezone configuration - set to your business timezone
export const TIMEZONE = 'Africa/Addis_Ababa'
export const LOCALE = 'en-ET'

const currencyFormatters = new Map()

export function getCurrencyCode() {
  const configuredCode = typeof localStorage === 'undefined'
    ? ''
    : localStorage.getItem('pos_currency_code')
  return /^[A-Z]{3}$/.test(configuredCode || '') ? configuredCode : DEFAULT_CURRENCY_CODE
}

export function setCurrencyCode(currencyCode) {
  const normalizedCode = String(currencyCode || '').trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(normalizedCode)) {
    throw new Error('Currency code must be a three-letter ISO code.')
  }
  new Intl.NumberFormat(LOCALE, { style: 'currency', currency: normalizedCode })
  localStorage.setItem('pos_currency_code', normalizedCode)
}

export function formatCurrency(value, currencyCode = getCurrencyCode()) {
  if (value === null || value === undefined || value === '') return '—'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  const code = /^[A-Z]{3}$/.test(String(currencyCode)) ? currencyCode : DEFAULT_CURRENCY_CODE
  if (!currencyFormatters.has(code)) {
    currencyFormatters.set(code, new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }))
  }
  return currencyFormatters.get(code).format(amount)
}

export function getStatusLabel(status) {
  const normalized = String(status || '').toUpperCase()
  if (['SETTLED', 'COMPLETED', 'SUCCESS'].includes(normalized)) return 'Settled'
  if (['PENDING', 'PROCESSING', 'IN_PROGRESS'].includes(normalized)) return 'Pending'
  if (['FAILED', 'DECLINED', 'REJECTED'].includes(normalized)) return 'Failed'
  if (normalized === 'PARTIALLY_CAPTURED') return 'Partially captured'
  if (normalized === 'PARTIALLY_REFUNDED') return 'Partially refunded'
  if (normalized === 'REFUNDED') return 'Refunded'
  if (normalized === 'REVERSED') return 'Reversed'
  if (normalized === 'AUTHORIZED') return 'Authorised'
  return status || 'Unknown'
}

export function getStatusClasses(status) {
  const normalized = String(status || '').toUpperCase()
  if (['SETTLED', 'COMPLETED', 'SUCCESS'].includes(normalized)) return 'bg-green-100 text-green-800'
  if (['PENDING', 'PROCESSING', 'IN_PROGRESS'].includes(normalized)) return 'bg-amber-100 text-amber-800'
  if (['FAILED', 'DECLINED', 'REJECTED'].includes(normalized)) return 'bg-red-100 text-red-800'
  if (['AUTHORIZED', 'PARTIALLY_CAPTURED'].includes(normalized)) return 'bg-blue-100 text-blue-800'
  if (['REFUNDED', 'PARTIALLY_REFUNDED', 'REVERSED'].includes(normalized)) return 'bg-purple-100 text-purple-800'
  return 'bg-gray-100 text-gray-700'
}

// Date/time formatting with timezone support
const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const shortDateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return dateTimeFormatter.format(date)
}

export function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return dateFormatter.format(date)
}

export function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return timeFormatter.format(date)
}

export function formatShortDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return shortDateTimeFormatter.format(date)
}

export function formatRelativeTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  
  const now = new Date()
  const diffMs = now - date
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  if (diffSecs < 60) return 'Just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) !== 1 ? 's' : ''} ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) !== 1 ? 's' : ''} ago`
  return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) !== 1 ? 's' : ''} ago`
}

export function formatDateTimeWithZone(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  
  const formatted = dateTimeFormatter.format(date)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return `${formatted} (${timezone})`
}
