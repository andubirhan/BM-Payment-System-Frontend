import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, Bell, Database, Server, Percent, Save, Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { currencyAPI, paymentIntegrationConfig, pricingAPI } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { getCurrencyCode, setCurrencyCode } from '@/lib/format'
import { getApiErrorMessage } from '@/lib/apiError'
import CurrencySelect from '@/components/CurrencySelect'

const DEFAULT_VAT_RATES = [
  { categoryCode: 'STANDARD', categoryName: 'Standard Rate', rate: 0.15, rateType: 'STANDARD', active: true },
  { categoryCode: 'REDUCED', categoryName: 'Reduced Rate', rate: 0.05, rateType: 'REDUCED', active: true },
  { categoryCode: 'ZERO', categoryName: 'Zero Rated', rate: 0.00, rateType: 'ZERO_RATED', active: true },
  { categoryCode: 'EXEMPT', categoryName: 'Exempt', rate: 0.00, rateType: 'EXEMPT', active: true },
]

export default function Settings() {
  const { user } = useAuth()
  const fixtureMode = paymentIntegrationConfig.mode === 'fixtures'
  const [currencyCode, setCurrencyCodeState] = useState(getCurrencyCode)
  const [currencyLoading, setCurrencyLoading] = useState(true)
  const [currencySaving, setCurrencySaving] = useState(false)
  const [currencyError, setCurrencyError] = useState('')
  const [currencyMessage, setCurrencyMessage] = useState('')
  const [vatRates, setVatRates] = useState([])
  const [serviceFeeRate, setServiceFeeRate] = useState('2')
  const [saleWithholdingVatRate, setSaleWithholdingVatRate] = useState('0')
  const [purchaseWithholdingVatRate, setPurchaseWithholdingVatRate] = useState('0')
  const [pricingLoading, setPricingLoading] = useState(true)
  const [pricingError, setPricingError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  useEffect(() => {
    let active = true
    currencyAPI.get()
      .then(({ data }) => {
        if (active && data?.currencyCode) {
          setCurrencyCode(data.currencyCode)
          setCurrencyCodeState(data.currencyCode)
        }
      })
      .catch((error) => {
        if (active) setCurrencyError(getApiErrorMessage(error, 'Unable to load the configured currency.'))
      })
      .finally(() => {
        if (active) setCurrencyLoading(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    pricingAPI.get()
      .then(({ data }) => {
        if (!active) return
        setVatRates(data.vatRates)
        setServiceFeeRate(String(Number(data.serviceFeeRate) * 100))
        setSaleWithholdingVatRate(String(Number(data.saleWithholdingVatRate || 0) * 100))
        setPurchaseWithholdingVatRate(String(Number(data.purchaseWithholdingVatRate || 0) * 100))
      })
      .catch((error) => {
        if (active) setPricingError(getApiErrorMessage(error, 'Unable to load VAT and fee settings.'))
      })
      .finally(() => {
        if (active) setPricingLoading(false)
      })
    return () => { active = false }
  }, [])

  const handleSaveCurrency = async () => {
    setCurrencySaving(true)
    setCurrencyError('')
    setCurrencyMessage('')
    try {
      const { data } = await currencyAPI.update(currencyCode)
      setCurrencyCode(data.currencyCode)
      setCurrencyCodeState(data.currencyCode)
      setCurrencyMessage(`Currency updated to ${data.currencyCode}. Existing transactions retain their recorded currency.`)
    } catch (error) {
      setCurrencyError(getApiErrorMessage(error, 'Unable to update the currency.'))
    } finally {
      setCurrencySaving(false)
    }
  }

  const handleSaveVatSettings = async () => {
    setSaving(true)
    setSaveMessage('')
    setPricingError('')
    try {
      const { data } = await pricingAPI.update({
        serviceFeeRate: Number(serviceFeeRate) / 100,
        saleWithholdingVatRate: Number(saleWithholdingVatRate) / 100,
        purchaseWithholdingVatRate: Number(purchaseWithholdingVatRate) / 100,
        vatRates,
      })
      setVatRates(data.vatRates)
      setServiceFeeRate(String(Number(data.serviceFeeRate) * 100))
      setSaleWithholdingVatRate(String(Number(data.saleWithholdingVatRate || 0) * 100))
      setPurchaseWithholdingVatRate(String(Number(data.purchaseWithholdingVatRate || 0) * 100))
      setSaveMessage('VAT, service fee, and withholding VAT settings saved successfully.')
    } catch (error) {
      setPricingError(getApiErrorMessage(error, 'Unable to save VAT and fee settings.'))
    } finally {
      setSaving(false)
    }
  }

  const addVatRate = () => {
    setVatRates([
      ...vatRates,
      {
        categoryCode: `CUSTOM-${Date.now()}`,
        categoryName: 'New Category',
        rate: 0.15,
        active: true,
      },
    ])
  }

  const removeVatRate = (index) => {
    setVatRates(vatRates.filter((_, i) => i !== index))
  }

  const updateVatRate = (index, field, value) => {
    const newRates = [...vatRates]
    newRates[index] = { ...newRates[index], [field]: value }
    setVatRates(newRates)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div><h1 className="text-3xl font-bold text-gray-900">Settings</h1><p className="mt-1 text-gray-500">Configuration and service connection status.</p></div>
      <div className={`flex items-start gap-3 rounded-lg border p-4 ${fixtureMode ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-blue-200 bg-blue-50 text-blue-950'}`} role="status">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div><p className="font-semibold">{fixtureMode ? 'Backend payment simulation is enabled' : 'Payment integration mode is active'}</p><p className="mt-1 text-sm">{fixtureMode ? 'Payment scenarios are processed and transaction data is stored by the POS backend. No live bank or card terminal is connected.' : 'The payment integration is configured for the live adapter.'}</p></div>
      </div>

      <Card>
        <CardHeader><CardTitle>Business currency</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">ETB is the default. Amounts are stored in major units with two decimal places. Changing this setting affects new transactions only; each transaction keeps the currency code recorded when it was created. No currency conversion occurs, so avoid report periods that span a currency change until reports are grouped by currency.</p>
          <div className="flex max-w-md flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <CurrencySelect
                id="currency-code"
                label="Business currency"
                value={currencyCode}
                onChange={setCurrencyCodeState}
                disabled={user?.role !== 'ADMIN' || currencyLoading || currencySaving}
              />
            </div>
            {user?.role === 'ADMIN' && (
              <Button onClick={handleSaveCurrency} disabled={currencyLoading || currencySaving || !currencyCode.trim()}>
                <Save className="mr-2 h-4 w-4" />{currencySaving ? 'Saving...' : 'Save currency'}
              </Button>
            )}
          </div>
          {user?.role !== 'ADMIN' && <p className="text-xs text-gray-500">Only an administrator can change the business currency.</p>}
          {currencyError && <p className="text-sm text-red-700" role="alert">{currencyError}</p>}
          {currencyMessage && <p className="text-sm text-green-700" role="status">{currencyMessage}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Percent className="h-5 w-5 text-blue-600" />VAT Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          {user?.role !== 'ADMIN' && <p className="text-sm text-gray-500">Only an administrator can change VAT rates or the service fee.</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700">Service Fee Rate (%)</label>
            <div className="mt-2 flex max-w-xs items-center gap-2">
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={serviceFeeRate}
                onChange={(e) => setServiceFeeRate(e.target.value)}
                disabled={user?.role !== 'ADMIN' || pricingLoading || saving}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
              />
              <span className="text-sm text-gray-500">%</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">VAT Rates</h3>
              {user?.role === 'ADMIN' && <Button onClick={addVatRate} variant="outline" size="sm" disabled={pricingLoading || saving}>
                <Plus className="h-4 w-4 mr-2" /> Add Rate
              </Button>}
            </div>
            <div className="space-y-3">
              {vatRates.map((rate, index) => (
                <div key={index} className="flex items-start gap-3 rounded-lg border border-gray-200 p-4">
                  <div className="flex-1 grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500">Category Code</label>
                      <input
                        type="text"
                        value={rate.categoryCode}
                        onChange={(e) => updateVatRate(index, 'categoryCode', e.target.value.toUpperCase())}
                        disabled={user?.role !== 'ADMIN' || pricingLoading || saving}
                        className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500">Category Name</label>
                      <input
                        type="text"
                        value={rate.categoryName}
                        onChange={(e) => updateVatRate(index, 'categoryName', e.target.value)}
                        disabled={user?.role !== 'ADMIN' || pricingLoading || saving}
                        className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500">Rate (%)</label>
                      <div className="mt-1 flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={(rate.rate * 100).toFixed(2)}
                          onChange={(e) => updateVatRate(index, 'rate', Number(e.target.value) / 100)}
                          disabled={user?.role !== 'ADMIN' || pricingLoading || saving}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                        <span className="text-xs text-gray-500">%</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={rate.active}
                        onChange={(e) => updateVatRate(index, 'active', e.target.checked)}
                        disabled={user?.role !== 'ADMIN' || pricingLoading || saving}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      Active
                    </label>
                    {user?.role === 'ADMIN' && vatRates.length > 1 && (
                      <button
                        onClick={() => removeVatRate(index)}
                        className="text-gray-400 hover:text-red-600"
                        title="Remove rate"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-gray-200 p-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Withholding VAT</h3>
              <p className="mt-1 text-xs text-gray-600">Rates apply to the calculated VAT amount, not the full invoice. Each transaction must explicitly opt in and provide certificate details. Both rates default to 0%.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <RateInput
                label="Sale withholding rate"
                value={saleWithholdingVatRate}
                onChange={setSaleWithholdingVatRate}
                disabled={user?.role !== 'ADMIN' || pricingLoading || saving}
              />
              <RateInput
                label="Purchase withholding rate"
                value={purchaseWithholdingVatRate}
                onChange={setPurchaseWithholdingVatRate}
                disabled={user?.role !== 'ADMIN' || pricingLoading || saving}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user?.role === 'ADMIN' && <Button onClick={handleSaveVatSettings} disabled={saving || pricingLoading}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save VAT Settings'}
            </Button>}
            {saveMessage && (
              <span className="text-sm text-green-600">{saveMessage}</span>
            )}
          </div>
          {pricingLoading && <p className="text-sm text-gray-500">Loading pricing settings...</p>}
          {pricingError && <p className="text-sm text-red-700" role="alert">{pricingError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Server className="h-5 w-5 text-blue-600" />Payment integration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Setting label="Mode" value={paymentIntegrationConfig.mode === 'fixtures' ? 'Backend fixture simulator' : 'HTTP integration'} />
            <Setting label="Payment simulation storage" value={paymentIntegrationConfig.persistence} />
            <Setting label="Payment execution endpoint" value={paymentIntegrationConfig.endpoints.liveBankPayment} mono />
          </div>
          <p className="text-sm text-gray-600">The front end sends the sale reference and selected test scenario to the payment service. BEFA fixture data, terminal simulation, and transaction persistence are handled by the backend. The fixture processor does not receive or store PAN or CVV. Replace the backend processor with a vendor adapter when connecting a real terminal.</p>
          <Link to="/payment-router"><Button variant="outline">Open payment flow <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5 text-blue-600" />POS API</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-gray-600">Transaction and reporting requests use the configured POS API client. API server settings are deployment-managed; database connection details are intentionally not exposed in this browser application.</p></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-blue-600" />Notifications</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-gray-600">Notification preferences will appear here once the backend supports saving and loading them.</p></CardContent>
      </Card>
    </div>
  )
}

function Setting({ label, value, mono = false }) {
  return <div className="min-w-0 rounded-lg border border-gray-200 p-3"><p className="text-xs font-medium text-gray-500">{label}</p><p className={`mt-1 break-all text-sm font-semibold text-gray-900 ${mono ? 'font-mono text-xs' : ''}`}>{value}</p></div>
}

function RateInput({ label, value, onChange, disabled }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700">{label} (%)</label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="number"
          step="0.01"
          min="0"
          max="100"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
        />
        <span className="text-xs text-gray-500">%</span>
      </div>
    </div>
  )
}
