import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, LoaderCircle, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  loadMockTransactionTemplate,
  saveMockTransactionTemplate,
} from '@/lib/mockTransactionTemplates'

const TRANSACTION_TYPES = [
  { value: 'PURCHASE', label: 'Purchase' },
  { value: 'SALE', label: 'Sale' },
]

const MAIN_FIELDS = [
  ['befaPaymentId', 'BEFA payment ID', 'text'],
  ['idempotencyKey', 'Idempotency key', 'text'],
  ['cashRegisterId', 'Cash register ID', 'text'],
  ['cashierId', 'Cashier ID', 'text'],
  ['customerName', 'Customer name', 'text'],
  ['customerTin', 'Customer TIN', 'text'],
]

const LINE_ITEM_FIELDS = [
  ['itemCode', 'Item code', 'text'],
  ['itemName', 'Item name', 'text'],
  ['unitPrice', 'Unit price', 'number'],
  ['quantity', 'Quantity', 'number'],
  ['discountAmount', 'Discount', 'number'],
  ['vatCategory', 'VAT category', 'text'],
]

const TENDER_FIELDS = [
  ['paymentMethod', 'Payment method', 'text'],
  ['paymentProvider', 'Payment provider', 'text'],
  ['amountTendered', 'Amount tendered', 'number'],
]

const EMPTY_LINE_ITEM = {
  itemCode: '',
  itemName: '',
  unitPrice: 0,
  quantity: 1,
  discountAmount: 0,
  vatExempt: false,
  vatCategory: 'STANDARD',
}

const EMPTY_TENDER = {
  paymentMethod: 'CASH',
  paymentProvider: 'POS',
  amountTendered: 0,
}

function toInputValue(value) {
  return value === null || value === undefined ? '' : String(value)
}

function FormField({ id, label, value, onChange, type = 'text', step }) {
  if (type === 'checkbox') {
    return (
      <label htmlFor={id} className="flex items-center gap-2 self-end rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700">
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        {label}
      </label>
    )
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">{label}</label>
      <Input
        id={id}
        type={type}
        step={step}
        value={toInputValue(value)}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function validateTemplateValues(value, path = 'template') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateTemplateValues(item, `${path}[${index + 1}]`))
    return
  }
  if (!value || typeof value !== 'object') return

  Object.entries(value).forEach(([key, fieldValue]) => {
    const fieldPath = `${path}.${key}`
    if (typeof fieldValue === 'number' && !Number.isFinite(fieldValue)) {
      throw new Error(`${fieldPath} must be a valid number.`)
    }
    if (fieldValue === '' && ['unitPrice', 'quantity', 'discountAmount', 'amountTendered'].includes(key)) {
      throw new Error(`${fieldPath} is required and must be a number.`)
    }
    validateTemplateValues(fieldValue, fieldPath)
  })
}

function SectionHeading({ title, description, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export default function TestTransactionBuilder() {
  const navigate = useNavigate()
  const [transactionType, setTransactionType] = useState('PURCHASE')
  const [template, setTemplate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadTemplate = useCallback(async (type) => {
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const loaded = await loadMockTransactionTemplate(type)
      setTemplate({
        ...loaded,
        headers: loaded.headers && typeof loaded.headers === 'object' ? loaded.headers : {},
        lineItems: Array.isArray(loaded.lineItems) ? loaded.lineItems : [],
        paymentTenders: Array.isArray(loaded.paymentTenders) ? loaded.paymentTenders : [],
      })
      return true
    } catch (loadError) {
      setError(loadError.message || 'Unable to load the transaction template.')
      setTemplate(null)
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTemplate(transactionType)
  }, [loadTemplate, transactionType])

  const updateTopLevel = (key, value) => {
    setTemplate((current) => ({
      ...current,
      [key]: typeof current[key] === 'number' && typeof value === 'string'
        ? (value === '' ? '' : Number(value))
        : value,
    }))
    setNotice('')
  }

  const updateRow = (section, index, key, value, type = 'text') => {
    const updatedValue = type === 'number' ? (value === '' ? '' : Number(value)) : value
    setTemplate((current) => ({
      ...current,
      [section]: current[section].map((row, rowIndex) => (
        rowIndex === index ? { ...row, [key]: updatedValue } : row
      )),
    }))
    setNotice('')
  }

  const updateHeader = (key, value) => {
    setTemplate((current) => ({
      ...current,
      headers: { ...current.headers, [key]: value },
    }))
    setNotice('')
  }

  const addHeader = () => {
    const headers = template.headers || {}
    let key = 'X-Custom-Header'
    let suffix = 1
    while (Object.hasOwn(headers, key)) {
      key = `X-Custom-Header-${suffix}`
      suffix += 1
    }
    updateHeader(key, '')
  }

  const renameHeader = (oldKey, newKey) => {
    const key = newKey.trim()
    if (!key || key === oldKey || Object.hasOwn(template.headers, key)) return
    const headers = { ...template.headers }
    const value = headers[oldKey]
    delete headers[oldKey]
    headers[key] = value
    setTemplate((current) => ({ ...current, headers }))
    setNotice('')
  }

  const removeRow = (section, index) => {
    setTemplate((current) => ({
      ...current,
      [section]: current[section].filter((_, rowIndex) => rowIndex !== index),
    }))
    setNotice('')
  }

  const saveTemplate = async () => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      validateTemplateValues(template)
      const befaPaymentId = await saveMockTransactionTemplate(transactionType, template)
      navigate('/transactions', {
        state: {
          paymentNotice: {
            type: 'success',
            message: `Saved your ${transactionType.toLowerCase()} test fixture upload with payment ID ${befaPaymentId}.`,
          },
        },
      })
    } catch (saveError) {
      setError(saveError.message || 'Unable to save the transaction template.')
    } finally {
      setSaving(false)
    }
  }

  const restoreTemplate = async () => {
    setLoading(true)
    setError('')
    setNotice('')
    const loaded = await loadTemplate(transactionType)
    if (loaded) {
      setNotice(`Reloaded your saved ${transactionType.toLowerCase()} fixture, or the default if you have not saved one yet.`)
    }
  }

  const additionalFields = template
    ? Object.entries(template).filter(([key, value]) => (
      !['headers', 'lineItems', 'paymentTenders', ...MAIN_FIELDS.map(([field]) => field)].includes(key)
      && ['string', 'number', 'boolean'].includes(typeof value)
    ))
    : []

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Fixture tools</p>
        <h1 className="mt-1 text-3xl font-bold text-gray-900">Upload test transaction data</h1>
        <p className="mt-2 max-w-3xl text-gray-600">
          Edit and save your own purchase or sale JSON fixture for the backend fixture payment service.
        </p>
      </header>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="note">
        Saving uploads a JSON file to your private server-side fixture folder. Fixture payments made while
        signed in use your saved file; before you save, the existing default fixture is used. Other users'
        fixtures and the bank response fixture are not changed.
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Transaction template type">
            {TRANSACTION_TYPES.map((type) => (
              <Button
                key={type.value}
                type="button"
                variant={transactionType === type.value ? 'default' : 'outline'}
                aria-pressed={transactionType === type.value}
                onClick={() => setTransactionType(type.value)}
              >
                {type.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      {notice && <p className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800" role="status"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</p>}

      {loading || !template ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-gray-500" role="status">
          {loading && <LoaderCircle className="h-5 w-5 animate-spin" />}
          {loading ? 'Loading transaction fields…' : 'Transaction fields are unavailable.'}
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{transactionType === 'SALE' ? 'Sale details' : 'Purchase details'}</CardTitle>
              <p className="text-sm text-gray-500">Enter the payment reference, customer, register, and cashier details.</p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {MAIN_FIELDS.map(([key, label]) => (
                  <FormField
                    key={key}
                    id={`template-${key}`}
                    label={label}
                    value={template[key] ?? ''}
                    onChange={(value) => updateTopLevel(key, value)}
                  />
                ))}
                {additionalFields.map(([key, value]) => (
                  <FormField
                    key={key}
                    id={`template-extra-${key}`}
                    label={key}
                    type={typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'checkbox' : 'text'}
                    value={value}
                    onChange={(updated) => updateTopLevel(key, updated)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <SectionHeading
                title="Line items"
                description="Edit item codes, quantities, prices, discounts, VAT exemptions, and categories."
                action={(
                  <Button type="button" variant="outline" size="sm" onClick={() => setTemplate((current) => ({
                    ...current,
                    lineItems: [...current.lineItems, { ...EMPTY_LINE_ITEM }],
                  }))}>
                    <Plus className="mr-2 h-4 w-4" />Add item
                  </Button>
                )}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              {template.lineItems.length === 0 && <p className="rounded-md bg-gray-50 p-4 text-sm text-gray-500">No line items. Add an item to this transaction.</p>}
              {template.lineItems.map((item, index) => (
                <div key={`line-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <h4 className="font-medium text-gray-900">Item {index + 1}</h4>
                    <Button type="button" variant="ghost" size="sm" aria-label={`Remove item ${index + 1}`} onClick={() => removeRow('lineItems', index)}>
                      <Trash2 className="h-4 w-4 text-red-600" /> <span className="ml-1">Remove</span>
                    </Button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {LINE_ITEM_FIELDS.map(([key, label, type]) => (
                      <FormField
                        key={key}
                        id={`line-${index}-${key}`}
                        label={label}
                        type={type}
                        step={type === 'number' ? '0.01' : undefined}
                        value={item[key] ?? ''}
                        onChange={(value) => updateRow('lineItems', index, key, value, type)}
                      />
                    ))}
                    <FormField
                      id={`line-${index}-vatExempt`}
                      label="VAT exempt"
                      type="checkbox"
                      value={item.vatExempt}
                      onChange={(value) => updateRow('lineItems', index, 'vatExempt', value)}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <SectionHeading
                title="Payment tenders"
                description="Set payment methods and tender amounts for the fixture."
                action={(
                  <Button type="button" variant="outline" size="sm" onClick={() => setTemplate((current) => ({
                    ...current,
                    paymentTenders: [...current.paymentTenders, { ...EMPTY_TENDER }],
                  }))}>
                    <Plus className="mr-2 h-4 w-4" />Add tender
                  </Button>
                )}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              {template.paymentTenders.length === 0 && <p className="rounded-md bg-gray-50 p-4 text-sm text-gray-500">No payment tenders. Add one if required.</p>}
              {template.paymentTenders.map((tender, index) => (
                <div key={`tender-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <h4 className="font-medium text-gray-900">Tender {index + 1}</h4>
                    <Button type="button" variant="ghost" size="sm" aria-label={`Remove tender ${index + 1}`} onClick={() => removeRow('paymentTenders', index)}>
                      <Trash2 className="h-4 w-4 text-red-600" /> <span className="ml-1">Remove</span>
                    </Button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {TENDER_FIELDS.map(([key, label, type]) => (
                      <FormField
                        key={key}
                        id={`tender-${index}-${key}`}
                        label={label}
                        type={type}
                        step={type === 'number' ? '0.01' : undefined}
                        value={tender[key] ?? ''}
                        onChange={(value) => updateRow('paymentTenders', index, key, value, type)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <SectionHeading
                title="Request headers"
                description="Edit or add the headers stored in the selected fixture file."
                action={(
                  <Button type="button" variant="outline" size="sm" onClick={addHeader}>
                    <Plus className="mr-2 h-4 w-4" />Add header
                  </Button>
                )}
              />
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(template.headers).map(([key, value], index) => (
                <div key={`${key}-${index}`} className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto]">
                  <FormField
                    id={`header-name-${index}`}
                    label={index === 0 ? 'Header name' : `Header name ${index + 1}`}
                    value={key}
                    onChange={(updatedKey) => renameHeader(key, updatedKey)}
                  />
                  <FormField
                    id={`header-value-${index}`}
                    label={index === 0 ? 'Header value' : `Header value ${index + 1}`}
                    value={value}
                    onChange={(updatedValue) => updateHeader(key, updatedValue)}
                  />
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove header ${key}`}
                      onClick={() => setTemplate((current) => {
                        const headers = { ...current.headers }
                        delete headers[key]
                        return { ...current, headers }
                      })}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))}
              {Object.keys(template.headers).length === 0 && <p className="text-sm text-gray-500">No request headers in this template.</p>}
            </CardContent>
          </Card>

          <div className="flex flex-wrap justify-end gap-3 pb-4">
            <Button type="button" variant="outline" onClick={restoreTemplate} disabled={loading || saving}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reload fixture file
            </Button>
            <Button type="button" onClick={saveTemplate} disabled={loading || saving || !template.befaPaymentId}>
              {saving
                ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                : <Save className="mr-2 h-4 w-4" />}
              Save in this browser
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
