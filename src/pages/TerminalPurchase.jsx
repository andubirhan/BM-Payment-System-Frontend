import { useState, useCallback, useEffect } from 'react'
import { CheckCircle2, CircleAlert, Clock3, CreditCard, LoaderCircle, RefreshCw, RotateCcw, Wifi, Plus, Trash2, X } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { bankPaymentAPI, pricingAPI, transactionAPI } from '@/lib/api'
import { formatCurrency, getCurrencyCode, getStatusLabel } from '@/lib/format'
import { calculateLineItemTotal, calculateTotals, roundMoney } from '@/lib/pricing'
import { getApiErrorMessage } from '@/lib/apiError'
import { isValidCalendarDate } from '@/lib/dateValidation'
import CurrencySelect from '@/components/CurrencySelect'
import { simulateBankPurchase } from '@/features/pos-terminal/deviceBridge'
import Notification from '@/components/Notification'

const terminalId = 'POS-DEVICE-001'
const createIdempotencyKey = () => globalThis.crypto?.randomUUID?.()
  || `pos-${Date.now()}-${Math.random().toString(16).slice(2)}`

const initialLineItem = {
  itemCode: '',
  itemName: '',
  unitPrice: '',
  quantity: '1',
  discountAmount: '0',
  vatExempt: false,
  vatCategory: 'STANDARD',
}

const initialPaymentTender = {
  paymentMethod: 'CASH',
  paymentProvider: '',
  amountTendered: '',
}

const initialForm = {
  befaPaymentId: '',
  cashRegisterId: 'reg-001',
  cashierId: 'cashier-001',
  customerName: '',
  customerTin: '',
  lineItems: [{ ...initialLineItem }],
  paymentTenders: [{ ...initialPaymentTender }],
}

function calculateTotalTendered(paymentTenders) {
  return paymentTenders.reduce((sum, tender) => sum + (Number(tender.amountTendered) || 0), 0)
}

const settled = (status) => ['SUCCESS', 'COMPLETED', 'SETTLED', 'AUTHORIZED', 'AUTHORISED', 'PAID'].includes(String(status || '').trim().toUpperCase())
const failed = (status) => ['FAILED', 'FAILURE', 'DECLINED', 'REJECTED', 'CANCELLED', 'CANCELED'].includes(String(status || '').trim().toUpperCase())

export default function TerminalPurchase() {
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = location.state?.from || '/sales'
  const isPreAuthFlow = location.state?.paymentFlow === 'PRE_AUTH'
  const [expiresInHours, setExpiresInHours] = useState('72')
  const [autoCaptureAmount, setAutoCaptureAmount] = useState('0')
  const [pricesIncludeVat, setPricesIncludeVat] = useState(true)
  const [currencyCode, setCurrencyCode] = useState(getCurrencyCode)
  const [applyCustomerFee, setApplyCustomerFee] = useState(false)
  const [applyWithholdingVat, setApplyWithholdingVat] = useState(false)
  const [withholdingCertificateNumber, setWithholdingCertificateNumber] = useState('')
  const [withholdingCertificateDate, setWithholdingCertificateDate] = useState('')
  const [vatRates, setVatRates] = useState([])
  const [serviceFeeRate, setServiceFeeRate] = useState(0.02)
  const [saleWithholdingVatRate, setSaleWithholdingVatRate] = useState(0)
  const [pricingReady, setPricingReady] = useState(false)
  const [pricingError, setPricingError] = useState('')
  const [form, setForm] = useState(initialForm)
  const [payment, setPayment] = useState(null)
  const [result, setResult] = useState(null)
  const [state, setState] = useState({ code: 'IDLE', message: 'Ready for a new bank purchase.' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [validationErrors, setValidationErrors] = useState({})
  const [notification, setNotification] = useState(null)
  const [preAuthIdempotencyKey, setPreAuthIdempotencyKey] = useState(createIdempotencyKey)
  const [terminalScenarios, setTerminalScenarios] = useState([])
  const [terminalScenarioId, setTerminalScenarioId] = useState('')
  const [terminalScenarioError, setTerminalScenarioError] = useState('')

  useEffect(() => {
    let active = true
    pricingAPI.get()
      .then(({ data }) => {
        if (!active) return
        setVatRates(data.vatRates)
        setServiceFeeRate(Number(data.serviceFeeRate))
        setSaleWithholdingVatRate(Number(data.saleWithholdingVatRate) || 0)
        setPricingReady(true)
      })
      .catch((requestError) => {
        if (!active) return
        setPricingError(getApiErrorMessage(requestError, 'Unable to load the configured VAT and fee rates.'))
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    bankPaymentAPI.getTerminalScenarios()
      .then(({ data }) => {
        if (!active) return
        setTerminalScenarios(data)
        setTerminalScenarioId(data[0]?.id || '')
      })
      .catch((requestError) => {
        if (!active) return
        if (requestError.status !== 404) {
          setTerminalScenarioError(getApiErrorMessage(requestError, 'Unable to load terminal test scenarios.'))
        }
      })
    return () => { active = false }
  }, [])

  const closeTerminal = useCallback(() => {
    if (!busy) navigate(returnTo, { replace: true })
  }, [busy, navigate, returnTo])

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') closeTerminal()
    }
    window.addEventListener('keydown', closeOnEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      document.body.style.overflow = ''
    }
  }, [closeTerminal])

  // Handle preloaded data from PaymentChannelRouter
  useEffect(() => {
    const preloadedData = location.state?.preloadedData
    const preloadedBefaId = location.state?.befaPaymentId
    
    if (preloadedData) {
      setPricesIncludeVat(true)
      setPayment({
        ...preloadedData,
        businessTransactionType: location.state?.businessTransactionType || 'SALE',
      })
      setForm(current => ({
        ...current,
        befaPaymentId: preloadedBefaId || preloadedData.befaPaymentId || '',
        cashRegisterId: preloadedData.cashRegisterId || current.cashRegisterId,
        cashierId: preloadedData.cashierId || current.cashierId,
        customerName: preloadedData.customerName || current.customerName,
        customerTin: preloadedData.customerTin || current.customerTin,
        lineItems: preloadedData.lineItems?.length ? preloadedData.lineItems : current.lineItems,
        paymentTenders: preloadedData.paymentTenders?.length ? preloadedData.paymentTenders : current.paymentTenders,
      }))
      setState({ code: 'IDLE', message: 'Payment data loaded from router. Ready to process.' })
    }
  }, [location.state])

  useEffect(() => {
    if (payment && amountDue > 0) {
      setForm(current => ({
        ...current,
        paymentTenders: current.paymentTenders.map((tender, index) => 
          index === 0 
            ? { ...tender, amountTendered: String(amountDue) }
            : tender
        ),
      }))
    }
  }, [pricesIncludeVat, applyCustomerFee, applyWithholdingVat, payment])

  const totals = calculateTotals(form.lineItems, pricesIncludeVat, applyCustomerFee, vatRates, serviceFeeRate)
  const withholdingVatAmount = applyWithholdingVat
    ? roundMoney(totals.totalVat * saleWithholdingVatRate) : 0
  const amountDue = roundMoney(Math.max(0, totals.totalNet - withholdingVatAmount))
  const totalTendered = calculateTotalTendered(form.paymentTenders)
  const changeDue = roundMoney(Math.max(0, totalTendered - amountDue))

  const updateForm = useCallback((path, value) => {
    setForm(current => {
      const newForm = { ...current }
      if (path.includes('.')) {
        const [section, index, field] = path.split('.')
        newForm[section] = [...newForm[section]]
        newForm[section][index] = { ...newForm[section][index], [field]: value }
      } else {
        newForm[path] = value
      }
      return newForm
    })
  }, [])

  const addLineItem = () => {
    setForm(current => ({
      ...current,
      lineItems: [...current.lineItems, { ...initialLineItem }],
    }))
  }

  const removeLineItem = (index) => {
    setForm(current => ({
      ...current,
      lineItems: current.lineItems.filter((_, i) => i !== index),
    }))
  }

  const addPaymentTender = () => {
    setForm(current => ({
      ...current,
      paymentTenders: [...current.paymentTenders, { ...initialPaymentTender }],
    }))
  }

  const removePaymentTender = (index) => {
    setForm(current => ({
      ...current,
      paymentTenders: current.paymentTenders.filter((_, i) => i !== index),
    }))
  }

  const validate = () => {
    const errors = {}
    if (!pricingReady) errors.pricing = 'Pricing settings are unavailable. Reload the page before processing this payment.'
    if (isPreAuthFlow && (!Number.isInteger(Number(expiresInHours)) || Number(expiresInHours) < 1)) {
      errors.expiresInHours = 'Expiry duration must be a whole number of at least 1 hour'
    }
    if (isPreAuthFlow && (!Number.isFinite(Number(autoCaptureAmount))
      || Math.round(Number(autoCaptureAmount) * 100) !== Number(autoCaptureAmount) * 100
      || Number(autoCaptureAmount) < 0
      || Number(autoCaptureAmount) > amountDue)) {
      errors.autoCaptureAmount = 'Automatic capture must be an amount with up to two decimals, between zero and the authorization amount'
    }
    if (applyWithholdingVat && !saleWithholdingVatRate) {
      errors.withholdingVat = 'A Sale withholding VAT rate must be configured before this option can be used.'
    } else if (applyWithholdingVat && (!withholdingCertificateNumber.trim() || !withholdingCertificateDate)) {
      errors.withholdingVat = 'Enter the withholding certificate number and date.'
    } else if (applyWithholdingVat && !isValidCalendarDate(withholdingCertificateDate)) {
      errors.withholdingVat = 'Enter a valid certificate date with a four-digit year, month 1–12, and day 1–31.'
    }
    if (isPreAuthFlow && applyWithholdingVat
        && Number(autoCaptureAmount) > 0 && Number(autoCaptureAmount) !== amountDue) {
      errors.autoCaptureAmount = 'Withholding VAT pre-authorizations must automatically capture the full cash/card balance or zero.'
    }
    
    if (!form.befaPaymentId.trim()) errors.befaPaymentId = 'BEFA payment ID is required'
    if (!form.cashRegisterId.trim()) errors.cashRegisterId = 'Register ID is required'
    if (!form.cashierId.trim()) errors.cashierId = 'Cashier ID is required'
    
    if (form.lineItems.length === 0) errors.lineItems = 'At least one item is required'
    
    form.lineItems.forEach((item, index) => {
      if (!item.vatExempt && !vatRates.some((rate) => rate.categoryCode === item.vatCategory && rate.active)) {
        errors[`lineItems.${index}.vatCategory`] = `No active VAT rate is configured for ${item.vatCategory || 'this category'}.`
      }
      if (!item.itemName.trim()) errors[`lineItems.${index}.itemName`] = 'Item name is required'
      if (!item.unitPrice || Number(item.unitPrice) <= 0) errors[`lineItems.${index}.unitPrice`] = 'Unit price must be greater than 0'
      if (!item.quantity || Number(item.quantity) <= 0) errors[`lineItems.${index}.quantity`] = 'Quantity must be greater than 0'
    })

    if (form.paymentTenders.length === 0) errors.paymentTenders = 'At least one payment tender is required'
    
    form.paymentTenders.forEach((tender, index) => {
      if (!tender.amountTendered || Number(tender.amountTendered) <= 0) {
        errors[`paymentTenders.${index}.amountTendered`] = 'Amount must be greater than 0'
      }
    })

    if (roundMoney(totalTendered) < amountDue) errors.total = 'Payment amount is insufficient'

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const loadSale = async (event) => {
    event.preventDefault()
    if (!form.befaPaymentId.trim()) return setError('Enter the BEFA payment reference.')
    setBusy(true); setError(''); setResult(null); setPayment(null); setState({ code: 'LOADING', message: 'Loading sale details…' })
    try {
      const response = await bankPaymentAPI.getBefaPayment({ 
        befaPaymentId: form.befaPaymentId.trim(),
        cashRegisterId: form.cashRegisterId,
        cashierId: form.cashierId,
        transactionType: 'SALE',
      })
      const befaData = response.data
      setPricesIncludeVat(true)
      setPayment(befaData)
      
      // Pre-fill form with BEFA data if available
      if (befaData.customerName) updateForm('customerName', befaData.customerName)
      if (befaData.customerTin) updateForm('customerTin', befaData.customerTin)
      if (befaData.lineItems && befaData.lineItems.length > 0) {
        setForm(current => ({
          ...current,
          lineItems: befaData.lineItems.map(item => ({
            itemCode: item.itemCode || '',
            itemName: item.itemName || '',
            unitPrice: String(item.unitPrice || ''),
            quantity: String(item.quantity || '1'),
            discountAmount: String(item.discountAmount || '0'),
            vatExempt: item.vatExempt || false,
            vatCategory: item.vatCategory || 'STANDARD',
          }))
        }))
      }
      
      setState({ code: 'READY', message: 'Sale loaded. Review and confirm before charging.' })
    } catch (requestError) {
      setState({ code: 'ERROR', message: 'Unable to load the sale.' })
      setError(getApiErrorMessage(requestError, 'The payment reference could not be loaded.'))
    } finally { setBusy(false) }
  }

  const pay = async () => {
    if (!payment || busy) return
    if (!validate()) return
    
    setBusy(true); setError('')
    try {
      const response = isPreAuthFlow
        ? await transactionAPI.preAuth({
          idempotencyKey: preAuthIdempotencyKey,
          befaPaymentId: payment.befaPaymentId,
          cashRegisterId: form.cashRegisterId,
          cashierId: form.cashierId,
          customerName: form.customerName,
          customerTin: form.customerTin,
          businessTransactionType: 'SALE',
          preauthHoldAmount: amountDue,
          expiresInHours: Number(expiresInHours),
          autoCaptureAmount: Number(autoCaptureAmount),
          pricesIncludeVat,
          applyCustomerFee,
          applyWithholdingVat,
          withholdingCertificateNumber: applyWithholdingVat ? withholdingCertificateNumber.trim() : null,
          withholdingCertificateDate: applyWithholdingVat ? withholdingCertificateDate : null,
          currencyCode,
          lineItems: form.lineItems.map((item) => ({
            ...item,
            unitPrice: Number(item.unitPrice) || 0,
            quantity: Math.round(Number(item.quantity) || 0),
            discountAmount: Number(item.discountAmount) || 0,
          })),
          paymentTenders: form.paymentTenders.map((tender) => ({
            ...tender,
            amountTendered: Number(tender.amountTendered) || 0,
            amountApplied: 0,
          })),
        })
        : await simulateBankPurchase({
          onState: setState,
          execute: () => bankPaymentAPI.execute({
            befaPaymentId: payment.befaPaymentId,
            cashRegisterId: form.cashRegisterId,
            cashierId: form.cashierId,
            terminalScenarioId: terminalScenarioId || undefined,
            pricesIncludeVat,
            applyCustomerFee,
            applyWithholdingVat,
            withholdingCertificateNumber: applyWithholdingVat ? withholdingCertificateNumber.trim() : null,
            withholdingCertificateDate: applyWithholdingVat ? withholdingCertificateDate : null,
            currencyCode,
          }, {
            ...payment,
            transactionType: 'SALE',
            businessTransactionType: 'SALE',
            lineItems: form.lineItems.map((item) => ({
              ...item,
              unitPrice: Number(item.unitPrice) || 0,
              quantity: Math.round(Number(item.quantity) || 0),
              discountAmount: Number(item.discountAmount) || 0,
            })),
            paymentTenders: form.paymentTenders.map((tender) => ({
              ...tender,
              amountTendered: Number(tender.amountTendered) || 0,
              amountApplied: 0,
            })),
            fixturePricing: {
              grossAmount: totals.totalGross,
              totalVat: totals.totalVat,
              serviceFeeAmount: totals.totalServiceFee,
              netAmount: totals.totalNet,
              withholdingVatApplied: applyWithholdingVat,
              withholdingVatRate: applyWithholdingVat ? saleWithholdingVatRate : 0,
              withholdingVatAmount,
              lineItems: form.lineItems.map((item) => {
                const line = calculateLineItemTotal(
                  item,
                  pricesIncludeVat,
                  applyCustomerFee,
                  vatRates,
                  serviceFeeRate,
                )
                return {
                  ...item,
                  lineGrossAmount: line.gross,
                  lineVatAmount: line.vatAmount,
                  lineServiceFeeAmount: line.serviceFee,
                  lineNetAmount: line.net,
                }
              }),
            },
          }),
        })
      const record = response.data?.body ?? response.data?.data ?? response.data
      setResult(record)
      const isSuccess = isPreAuthFlow
        ? String(record?.status || '').toUpperCase() === 'AUTHORIZED'
        : settled(record?.status)
      const isFailure = failed(record?.status)
      setState({
        code: isSuccess ? 'APPROVED' : isFailure ? 'DECLINED' : 'PENDING',
        message: isSuccess
          ? (isPreAuthFlow ? 'Pre-authorization approved. Capture it from Transaction actions.' : 'Payment approved. You may remove the card.')
          : isFailure
            ? 'Payment was not approved.'
            : 'Payment is still being confirmed. Do not retry; check status shortly.',
      })

      setNotification({
        type: isSuccess ? 'success' : isFailure ? 'error' : 'info',
        message: isSuccess
          ? (isPreAuthFlow ? 'Sale pre-authorization created successfully.' : 'Transaction completed successfully!')
          : isFailure
            ? 'The bank declined the transaction.'
            : 'Payment is pending confirmation. Do not retry; use Check status.',
      })

      if (isSuccess || isFailure) {
        setTimeout(() => {
          navigate(returnTo, { replace: true })
        }, 2000)
      }
    } catch (requestError) {
      setState({ code: 'OUTCOME_UNKNOWN', message: 'Payment outcome is unknown. Check status before retrying.' })
      setError(getApiErrorMessage(requestError, 'No final payment response was received.'))
      setNotification({
        type: 'warning',
        message: 'The payment result could not be confirmed. Do not retry until you check its status.'
      })
    } finally { setBusy(false) }
  }

  const checkStatus = async () => {
    setBusy(true); setError(''); setState({ code: 'CHECKING', message: 'Checking payment status…' })
    try {
      const record = (await bankPaymentAPI.getStatus(payment.befaPaymentId)).data
      setResult(record)
      const isSettled = settled(record?.status)
      const isDeclined = failed(record?.status)
      setState({
        code: isSettled ? 'APPROVED' : isDeclined ? 'DECLINED' : 'PENDING',
        message: isSettled
          ? 'Payment approved. You may remove the card.'
          : isDeclined
            ? 'Payment was not approved.'
            : 'Payment remains pending. Check again shortly.',
      })
      setNotification({
        type: isSettled ? 'success' : isDeclined ? 'error' : 'info',
        message: isSettled
          ? 'The bank confirmed this payment.'
          : isDeclined
            ? 'The bank declined this payment.'
            : 'The bank has not confirmed this payment yet. Do not retry.',
      })
    } catch (requestError) {
      setState({ code: 'OUTCOME_UNKNOWN', message: 'Status could not be confirmed.' })
      setError(getApiErrorMessage(requestError, 'Unable to check payment status.'))
      setNotification({
        type: 'warning',
        message: 'Unable to confirm the payment status. Do not retry until the bank responds.',
      })
    } finally { setBusy(false) }
  }

  const reset = () => {
    setForm(initialForm)
    setPayment(null)
    setResult(null)
    setError('')
    setValidationErrors({})
    setApplyWithholdingVat(false)
    setWithholdingCertificateNumber('')
    setWithholdingCertificateDate('')
    setPreAuthIdempotencyKey(createIdempotencyKey())
    setBusy(false)
    setState({ code: 'IDLE', message: 'Ready for a new bank purchase.' })
  }

  return (
    <main
      className="fixed inset-0 z-[60] flex items-stretch justify-end overflow-hidden bg-slate-950/70 text-slate-100 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeTerminal()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="terminal-title"
        className="terminal-device relative flex h-full max-h-screen w-full flex-col overflow-hidden rounded-l-[1.5rem] border border-r-0 border-slate-500/80 bg-gradient-to-br from-slate-400 via-slate-600 to-slate-800 p-2 shadow-[-24px_0_80px_-25px_rgba(0,0,0,0.9)] md:w-1/2 md:max-w-[760px] md:rounded-l-[2.25rem] md:p-4"
      >
        <button
          type="button"
          onClick={closeTerminal}
          disabled={busy}
          aria-label="Close POS terminal"
          className="absolute right-2 top-2 z-10 rounded-lg border border-slate-300/30 bg-slate-700/80 p-2 text-slate-100 shadow-md transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 sm:right-4 sm:top-3"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="flex h-9 shrink-0 items-center justify-center gap-3 px-12 sm:h-11" aria-hidden="true">
          <span className="terminal-speaker h-1.5 w-16 rounded-full sm:w-24" />
          <span className="h-2 w-2 rounded-full border border-slate-300/40 bg-slate-800 shadow-inner" />
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
          <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-slate-200/80 sm:ml-2">POS · VAT 01</span>
        </div>

        <div className="terminal-screen min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-950 bg-slate-950 shadow-[inset_0_0_0_2px_rgba(148,163,184,0.18),0_0_24px_rgba(34,211,238,0.12)] sm:rounded-[1.5rem]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 bg-slate-900 px-4 py-4 sm:px-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">Tax VAT terminal</p>
              <h1 id="terminal-title" className="mt-1 text-xl font-bold">{isPreAuthFlow ? 'Sale pre-authorization' : 'Bank sale'}</h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300 sm:gap-3">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950 px-3 py-1.5 text-emerald-200">
                <Wifi className="h-3.5 w-3.5" /> Online
              </span>
              <span className="hidden sm:inline">{terminalId}</span>
            </div>
          </header>

          <div className="grid gap-4 bg-slate-950 p-3 sm:gap-6 sm:p-5 2xl:grid-cols-[1.15fr_.85fr] 2xl:p-7">
          <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 sm:p-5">
            {!payment ? (
              <form onSubmit={loadSale} className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold">Start sale</h2>
                  <p className="mt-1 text-sm text-slate-400">Enter the BEFA payment reference supplied for this sale.</p>
                </div>
                <Field
                  label="BEFA payment reference"
                  value={form.befaPaymentId}
                  onChange={(value) => updateForm('befaPaymentId', value)}
                  error={validationErrors.befaPaymentId}
                  autoFocus
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Register"
                    value={form.cashRegisterId}
                    onChange={(value) => updateForm('cashRegisterId', value)}
                    error={validationErrors.cashRegisterId}
                  />
                  <Field
                    label="Cashier"
                    value={form.cashierId}
                    onChange={(value) => updateForm('cashierId', value)}
                    error={validationErrors.cashierId}
                  />
                </div>
                <button className="terminal-primary" disabled={busy}>
                  {busy ? 'Loading sale…' : 'Load sale'}
                </button>
              </form>
            ) : (
              <div className="space-y-5">
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">Sale review</p>
                    <h2 className="mt-1 text-xl font-bold">{payment.customerName || 'Customer sale'}</h2>
                    <p className="mt-1 text-sm text-slate-400">BEFA {payment.befaPaymentId}</p>
                  </div>
                  <button
                    className="terminal-secondary"
                    type="button"
                    disabled={busy}
                    onClick={reset}
                  >
                    Cancel
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Customer name"
                    value={form.customerName}
                    onChange={(value) => updateForm('customerName', value)}
                  />
                  <Field
                    label="TIN (TAX Identification number)"
                    value={form.customerTin}
                    onChange={(value) => updateForm('customerTin', value)}
                  />
                </div>
                <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/50 p-4">
                  {terminalScenarios.length > 0 && !isPreAuthFlow && (
                    <div className="max-w-md">
                      <label htmlFor="terminal-test-scenario" className="block text-sm font-medium text-slate-100">
                        Card terminal test scenario
                      </label>
                      <select
                        id="terminal-test-scenario"
                        value={terminalScenarioId}
                        onChange={(event) => setTerminalScenarioId(event.target.value)}
                        disabled={busy}
                        className="mt-2 w-full rounded-lg border border-amber-700/70 bg-slate-950 px-3 py-3 text-white outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400"
                      >
                        {terminalScenarios.map((scenario) => (
                          <option key={scenario.id} value={scenario.id}>{scenario.label}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-amber-200">
                        Test-only backend simulation. No PAN or CVV is entered, transmitted, or stored.
                      </p>
                      {terminalScenarios.find((scenario) => scenario.id === terminalScenarioId)?.description && (
                        <p className="mt-1 text-xs text-slate-400">
                          {terminalScenarios.find((scenario) => scenario.id === terminalScenarioId).description}
                        </p>
                      )}
                    </div>
                  )}
                  {terminalScenarioError && (
                    <p className="text-sm text-rose-300" role="alert">{terminalScenarioError}</p>
                  )}
                  <div className="max-w-md">
                    <CurrencySelect
                      id="sale-transaction-currency"
                      value={currencyCode}
                      onChange={setCurrencyCode}
                      dark
                    />
                    <p className="mt-1 text-xs text-slate-400">The selected currency and entered amount are saved as-is. No exchange conversion is applied.</p>
                  </div>
                  <label className="flex items-start gap-3 text-sm text-slate-100">
                    <input
                      type="checkbox"
                      checked={pricesIncludeVat}
                      onChange={(event) => setPricesIncludeVat(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-500 focus:ring-cyan-400"
                    />
                    <span>
                      <span className="font-medium">Entered prices already include VAT</span>
                      <span className="mt-1 block text-xs text-slate-400">Checked by default: VAT is already included in the entered prices.</span>
                    </span>
                  </label>
                  <div className="space-y-3 border-t border-slate-700 pt-3">
                    <label className="flex items-start gap-3 text-sm text-slate-100">
                      <input
                        type="checkbox"
                        checked={applyWithholdingVat}
                        onChange={(event) => setApplyWithholdingVat(event.target.checked)}
                        disabled={!saleWithholdingVatRate}
                        className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-500 focus:ring-cyan-400 disabled:opacity-50"
                      />
                      <span>
                        <span className="font-medium">Apply Sale withholding VAT ({(saleWithholdingVatRate * 100).toFixed(2)}%)</span>
                        <span className="mt-1 block text-xs text-slate-400">Calculated from the VAT amount. The full invoice total remains recorded; withholding reduces cash/card due.</span>
                      </span>
                    </label>
                    {applyWithholdingVat && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          label="Withholding certificate number"
                          value={withholdingCertificateNumber}
                          onChange={setWithholdingCertificateNumber}
                          error={validationErrors.withholdingVat}
                        />
                        <Field
                          label="Withholding certificate date"
                          value={withholdingCertificateDate}
                          onChange={setWithholdingCertificateDate}
                          type="date"
                          min="0001-01-01"
                          max="9999-12-31"
                          invalid={Boolean(validationErrors.withholdingVat && withholdingCertificateDate)}
                        />
                      </div>
                    )}
                  </div>
                  {validationErrors.withholdingVat && <p className="text-xs text-rose-400" role="alert">{validationErrors.withholdingVat}</p>}
                  <label className="flex items-start gap-3 text-sm text-slate-100">
                    <input
                      type="checkbox"
                      checked={applyCustomerFee}
                      onChange={(event) => setApplyCustomerFee(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-500 focus:ring-cyan-400"
                    />
                    <span>
                      <span className="font-medium">Apply customer service fee ({(serviceFeeRate * 100).toFixed(2)}%)</span>
                      <span className="mt-1 block text-xs text-slate-400">Optional Sale-only surcharge; unchecked by default.</span>
                    </span>
                  </label>
                </div>
                {isPreAuthFlow && (
                  <div className="space-y-4 rounded-lg border border-cyan-700/50 bg-cyan-950/30 p-4">
                    <div>
                      <h3 className="text-sm font-semibold text-cyan-100">Authorization lifecycle</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-300">
                        Set when the authorization is processed and how much to capture automatically. A manual capture before expiry cancels the scheduled amount.
                      </p>
                    </div>
                    <Field
                      label="Authorization expires after (hours)"
                      value={expiresInHours}
                      onChange={setExpiresInHours}
                      error={validationErrors.expiresInHours}
                      type="number"
                      step="1"
                      min="1"
                    />
                    <Field
                      label="Automatic capture at expiry (0 = none)"
                      value={autoCaptureAmount}
                      onChange={setAutoCaptureAmount}
                      error={validationErrors.autoCaptureAmount}
                      type="number"
                      step="0.01"
                      min="0"
                      max={amountDue}
                    />
                    <p className="text-xs text-slate-400">
                      Maximum: {formatCurrency(amountDue)}. If set to 0, the hold is released without an automatic capture. If withholding is selected, capture must be the full cash/card balance or zero.
                    </p>
                  </div>
                )}

                <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-300">Line items</h3>
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600"
                      onClick={addLineItem}
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </div>
                  {form.lineItems.map((item, index) => (
                    <div key={index} className="mb-3 rounded border border-slate-700 bg-slate-950/50 p-3">
                      <div className="mb-2 flex justify-between">
                        <span className="text-xs text-slate-400">Item {index + 1}</span>
                        {form.lineItems.length > 1 && (
                          <button
                            type="button"
                            className="text-rose-400 hover:text-rose-300"
                            onClick={() => removeLineItem(index)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Field
                          label="Name"
                          value={item.itemName}
                          onChange={(value) => updateForm(`lineItems.${index}.itemName`, value)}
                          error={validationErrors[`lineItems.${index}.itemName`]}
                        />
                        <Field
                          label="Price"
                          value={item.unitPrice}
                          onChange={(value) => updateForm(`lineItems.${index}.unitPrice`, value)}
                          error={validationErrors[`lineItems.${index}.unitPrice`]}
                          type="number"
                          step="0.01"
                        />
                        <Field
                          label="Qty"
                          value={item.quantity}
                          onChange={(value) => updateForm(`lineItems.${index}.quantity`, value)}
                          error={validationErrors[`lineItems.${index}.quantity`]}
                          type="number"
                          min="1"
                        />
                        <Field
                          label="Discount"
                          value={item.discountAmount}
                          onChange={(value) => updateForm(`lineItems.${index}.discountAmount`, value)}
                          type="number"
                          step="0.01"
                        />
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`vat-exempt-${index}`}
                          checked={item.vatExempt}
                          onChange={(e) => updateForm(`lineItems.${index}.vatExempt`, e.target.checked)}
                          className="h-3 w-3 rounded border-slate-600 bg-slate-950 text-cyan-500 focus:ring-cyan-400"
                        />
                        <label htmlFor={`vat-exempt-${index}`} className="text-xs text-slate-300">
                          VAT exempt
                        </label>
                      </div>
                      <div className="mt-3">
                        <label htmlFor={`vat-category-${index}`} className="block text-xs text-slate-400">VAT category</label>
                        <select
                          id={`vat-category-${index}`}
                          value={item.vatCategory}
                          onChange={(event) => updateForm(`lineItems.${index}.vatCategory`, event.target.value)}
                          disabled={item.vatExempt}
                          className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
                        >
                          {vatRates.filter((rate) => rate.active).map((rate) => (
                            <option key={rate.categoryCode} value={rate.categoryCode}>
                              {rate.categoryName} ({(Number(rate.rate) * 100).toFixed(2)}%)
                            </option>
                          ))}
                        </select>
                        {validationErrors[`lineItems.${index}.vatCategory`] && (
                          <p className="mt-1 text-xs text-rose-300" role="alert">
                            {validationErrors[`lineItems.${index}.vatCategory`]}
                          </p>
                        )}
                      </div>
                      <div className="mt-2 text-right text-xs text-slate-400">
                        {formatCurrency(calculateLineItemTotal(item, pricesIncludeVat, applyCustomerFee, vatRates, serviceFeeRate).net, currencyCode)}
                      </div>
                    </div>
                  ))}
                  {validationErrors.lineItems && (
                    <p className="text-xs text-rose-400">{validationErrors.lineItems}</p>
                  )}
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-300">Payment tenders</h3>
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600"
                      onClick={addPaymentTender}
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </div>
                  {form.paymentTenders.map((tender, index) => (
                    <div key={index} className="mb-3 rounded border border-slate-700 bg-slate-950/50 p-3">
                      <div className="mb-2 flex justify-between">
                        <span className="text-xs text-slate-400">Payment {index + 1}</span>
                        {form.paymentTenders.length > 1 && (
                          <button
                            type="button"
                            className="text-rose-400 hover:text-rose-300"
                            onClick={() => removePaymentTender(index)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs text-slate-300">Method</label>
                          <select
                            className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400"
                            value={tender.paymentMethod}
                            onChange={(e) => updateForm(`paymentTenders.${index}.paymentMethod`, e.target.value)}
                          >
                            <option value="CASH">Cash</option>
                            <option value="CARD">Card</option>
                            <option value="MOBILE_MONEY">Mobile Money</option>
                            <option value="QR">QR Code</option>
                            <option value="BANK_TRANSFER">Bank Transfer</option>
                          </select>
                        </div>
                        <Field
                          label="Amount"
                          value={tender.amountTendered}
                          onChange={(value) => updateForm(`paymentTenders.${index}.amountTendered`, value)}
                          error={validationErrors[`paymentTenders.${index}.amountTendered`]}
                          type="number"
                          step="0.01"
                        />
                      </div>
                    </div>
                  ))}
                  {validationErrors.paymentTenders && (
                    <p className="text-xs text-rose-400">{validationErrors.paymentTenders}</p>
                  )}
                </div>
              </div>
            )}
          </section>

          <aside className="rounded-xl border border-slate-700 bg-slate-800 p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{isPreAuthFlow ? 'Authorization amount' : 'Amount due'}</p>
            <p className="mt-2 text-4xl font-bold tabular-nums">
              {payment ? formatCurrency(amountDue, currencyCode) : '—'}
            </p>
            <p className="mt-2 text-sm text-slate-400">{isPreAuthFlow ? 'Sale · Authorization hold' : 'POS terminal · Sale payment'}</p>

            {payment && (
              <>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Subtotal before VAT</span>
                    <span className="font-semibold">{formatCurrency(totals.totalGross, currencyCode)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">VAT</span>
                    <span className="font-semibold">{formatCurrency(totals.totalVat, currencyCode)}</span>
                  </div>
                  {applyWithholdingVat && (
                    <div className="flex justify-between text-amber-300">
                      <span>Withholding VAT</span>
                      <span className="font-semibold">−{formatCurrency(withholdingVatAmount, currencyCode)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Customer fee</span>
                    <span className="font-semibold">{formatCurrency(totals.totalServiceFee, currencyCode)}</span>
                  </div>
                  <div className="mt-3 border-t border-slate-700 pt-3">
                    <div className="flex justify-between">
                      <span className="font-semibold">Invoice total</span>
                      <span className="font-bold">{formatCurrency(totals.totalNet, currencyCode)}</span>
                    </div>
                    <div className="mt-2 flex justify-between">
                      <span className="font-semibold">Cash/card due</span>
                      <span className="font-bold">{formatCurrency(amountDue, currencyCode)}</span>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-slate-700 pt-3">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Tendered</span>
                      <span className="font-semibold">{formatCurrency(totalTendered, currencyCode)}</span>
                    </div>
                    {changeDue > 0 && (
                      <div className="mt-1 flex justify-between">
                        <span className="text-slate-400">Change</span>
                        <span className="font-semibold text-emerald-400">{formatCurrency(changeDue, currencyCode)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            <DeviceState state={state} busy={busy} />

            {error && (
              <p className="mt-4 rounded-lg border border-rose-400/40 bg-rose-950/40 p-3 text-sm text-rose-100" role="alert">
                {error}
              </p>
            )}

            {validationErrors.total && (
              <p className="mt-4 rounded-lg border border-rose-400/40 bg-rose-950/40 p-3 text-sm text-rose-100" role="alert">
                {validationErrors.total}
              </p>
            )}
            {(pricingError || validationErrors.pricing) && (
              <p className="mt-4 rounded-lg border border-rose-400/40 bg-rose-950/40 p-3 text-sm text-rose-100" role="alert">
                {pricingError || validationErrors.pricing}
              </p>
            )}

            {payment && !result && (
              <button
                type="button"
                className="terminal-primary mt-5 w-full"
                disabled={busy || !pricingReady}
                onClick={pay}
              >
                <CreditCard className="h-5 w-5" />
                {busy
                  ? (isPreAuthFlow ? 'Creating authorization…' : 'Processing payment…')
                  : (isPreAuthFlow ? 'Authorize sale' : 'Pay by bank')}
              </button>
            )}

            {payment && ['PENDING', 'OUTCOME_UNKNOWN'].includes(state.code) && (
              <button
                type="button"
                className="terminal-secondary mt-3 w-full"
                disabled={busy}
                onClick={checkStatus}
              >
                <RefreshCw className="h-4 w-4" /> Check status
              </button>
            )}

            {result && (
              <div className="mt-5 rounded-lg border border-slate-700 bg-slate-950/70 p-4">
                <div className="flex items-start gap-3">
                  {settled(result.status)
                    ? <CheckCircle2 className="h-6 w-6 text-emerald-300" />
                    : failed(result.status)
                      ? <CircleAlert className="h-6 w-6 text-rose-300" />
                      : <Clock3 className="h-6 w-6 text-amber-300" />}
                  <div>
                    <p className="font-semibold">{getStatusLabel(result.status)}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Transaction {result.transactionId || 'reference unavailable'}
                    </p>
                    {result.bankTransactionId && (
                      <p className="mt-1 text-xs text-slate-400">Bank ref {result.bankTransactionId}</p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="terminal-secondary mt-4 w-full"
                  onClick={reset}
                >
                  <RotateCcw className="h-4 w-4" /> New sale
                </button>
              </div>
            )}
          </aside>
          </div>
        </div>

        <div className="flex h-8 shrink-0 items-center justify-center gap-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-slate-200/70 sm:h-10" aria-hidden="true">
          <span className="h-px w-8 bg-slate-300/30" />
          Secure point of sale
          <span className="h-px w-8 bg-slate-300/30" />
        </div>
      </section>
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          duration={3000}
          onClose={() => setNotification(null)}
        />
      )}
    </main>
  )
}

function Field({ label, value, onChange, error, invalid = false, type = 'text', step = '1', min }) {
  return (
    <label className="block text-sm font-medium text-slate-200">
      {label}
      <input
        className={`mt-2 w-full rounded-lg border px-3 py-3 text-base text-white outline-none focus:ring-2 ${
          error || invalid
            ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
            : 'border-slate-600 focus:border-cyan-400 focus:ring-cyan-400'
        } bg-slate-950`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        step={step}
        min={min}
        aria-invalid={Boolean(error || invalid)}
        required={label.includes('required') || label.includes('ID')}
      />
      {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
    </label>
  )
}

function DeviceState({ state, busy }) {
  const Icon = busy
    ? LoaderCircle
    : state.code === 'APPROVED'
    ? CheckCircle2
    : state.code === 'DECLINED' || state.code === 'ERROR'
    ? CircleAlert
    : CreditCard

  return (
    <div className="mt-6 rounded-lg border border-slate-700 bg-slate-950/70 p-4" role="status">
      <div className="flex items-start gap-3">
        <Icon
          className={`mt-0.5 h-5 w-5 shrink-0 ${
            busy ? 'animate-spin text-cyan-300' : 'text-cyan-300'
          }`}
        />
        <div>
          <p className="font-semibold">{state.code.replaceAll('_', ' ')}</p>
          <p className="mt-1 text-sm text-slate-300">{state.message}</p>
        </div>
      </div>
    </div>
  )
}
