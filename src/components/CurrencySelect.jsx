import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { data as currencyRecords } from 'currency-codes'
import { cn } from '@/lib/utils'

const currencies = [...new Map(currencyRecords.map((record) => [record.code, {
  code: record.code,
  name: record.currency,
  countries: record.countries || [],
}])).values()].sort((left, right) => left.code.localeCompare(right.code))

export default function CurrencySelect({ id, label = 'Transaction currency', value, onChange, dark = false, disabled = false }) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const selected = currencies.find((currency) => currency.code === value)
  const displayValue = selected ? `${selected.code} — ${selected.name}` : value

  const filteredCurrencies = useMemo(() => {
    const search = query.trim().toLowerCase()
    if (!search) return currencies
    return currencies.filter(({ code, name, countries }) => (
      code.toLowerCase().includes(search)
      || name.toLowerCase().includes(search)
      || countries.some((country) => country.toLowerCase().includes(search))
    ))
  }, [query])

  useEffect(() => {
    if (!isOpen) return undefined
    const closeOnOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [isOpen])

  const openList = () => {
    setQuery('')
    setIsOpen(true)
  }

  const chooseCurrency = (code) => {
    onChange(code)
    setIsOpen(false)
    setQuery('')
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsOpen(false)
      setQuery('')
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIsOpen(true)
    } else if (event.key === 'Enter' && isOpen && filteredCurrencies.length) {
      event.preventDefault()
      chooseCurrency(filteredCurrencies[0].code)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={id} className={cn('mb-1 block text-sm font-medium', dark ? 'text-slate-200' : 'text-gray-700')}>
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          disabled={disabled}
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={`${id}-options`}
          value={isOpen ? query : displayValue || ''}
          placeholder="Search country or currency code"
          onFocus={openList}
          onChange={(event) => {
            setQuery(event.target.value)
            setIsOpen(true)
          }}
          onKeyDown={handleKeyDown}
          className={cn(
            'h-10 w-full rounded-md border px-3 py-2 pr-10 text-sm outline-none focus:ring-2',
            dark
              ? 'border-slate-600 bg-slate-950 text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-50'
              : 'border-input bg-background text-gray-900 placeholder:text-muted-foreground focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-70'
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={isOpen ? 'Close currency options' : 'Show currency options'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (isOpen) {
              setIsOpen(false)
              setQuery('')
            } else {
              inputRef.current?.focus()
              openList()
            }
          }}
          className={cn(
            'absolute inset-y-0 right-0 flex items-center px-3',
            cn(dark ? 'text-slate-400' : 'text-gray-500', disabled && 'cursor-not-allowed opacity-50')
          )}
        >
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {isOpen && (
        <ul
          id={`${id}-options`}
          role="listbox"
          aria-label="Available currencies"
          className={cn(
            'absolute z-40 mt-1 max-h-60 w-full overflow-y-auto rounded-md border py-1 shadow-lg',
            dark ? 'border-slate-600 bg-slate-900' : 'border-gray-200 bg-white'
          )}
        >
          {filteredCurrencies.length ? filteredCurrencies.map(({ code, name, countries }) => (
            <li
              key={code}
              role="option"
              aria-selected={value === code}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseCurrency(code)}
              className={cn(
                'cursor-pointer px-3 py-2 text-sm',
                dark
                  ? 'text-slate-100 hover:bg-slate-700'
                  : 'text-gray-900 hover:bg-blue-50'
              )}
            >
              <span className="font-semibold">{code}</span>
              <span className={cn('ml-2', dark ? 'text-slate-300' : 'text-gray-700')}>{name}</span>
              <span className={cn('mt-0.5 block truncate text-xs', dark ? 'text-slate-400' : 'text-gray-500')}>
                {countries.length ? countries.join(', ') : 'International'}
              </span>
            </li>
          )) : (
            <li className={cn('px-3 py-2 text-sm', dark ? 'text-slate-400' : 'text-gray-500')} role="status">
              No matching currency or country.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
