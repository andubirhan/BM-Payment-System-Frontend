import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, LoaderCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import CurrencySelect from '@/components/CurrencySelect'
import { bankPaymentAPI, paymentIntegrationConfig, pricingAPI, transactionAPI } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/apiError'
import { isValidCalendarDate } from '@/lib/dateValidation'
import { formatCurrency, getCurrencyCode, getStatusClasses, getStatusLabel } from '@/lib/format'
import { calculateTotals } from '@/lib/pricing'
import ErrorNotice from '@/components/ErrorNotice'
import PersistentNotification from '@/components/PersistentNotification'

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : format(date, 'MMM d, yyyy HH:mm')
}

function getPaymentTotal(payment) {
  const tenders = payment?.paymentTenders || []
  if (tenders.length) return tenders.reduce((total, tender) => total + (Number(tender.amountTendered) || 0), 0)
  return Number(payment?.netAmount ?? payment?.grossAmount ?? payment?.amountInCents) || 0
}

function adjustTenderAmounts(tenders, totalAmount) {
  const amounts = (tenders || []).map((tender) => Math.max(0, Math.round((Number(tender.amountTendered) || 0) * 100)))
  const currentTotal = amounts.reduce((total, amount) => total + amount, 0)
  const targetTotal = Math.max(0, Math.round((Number(totalAmount) || 0) * 100))
  if (!amounts.length || currentTotal === 0) return (tenders || []).map((tender) => ({ ...tender }))

  const allocations = amounts.map((amount, index) => {
    const exactAmount = targetTotal * amount / currentTotal
    return { index, amount: Math.floor(exactAmount), remainder: exactAmount % 1 }
  })
  let remainingCents = targetTotal - allocations.reduce((total, allocation) => total + allocation.amount, 0)
  const priority = [...allocations].sort((left, right) => right.remainder - left.remainder)
  for (let index = 0; index < remainingCents; index += 1) {
    priority[index].amount += 1
  }

  return (tenders || []).map((tender, index) => {
    const amount = allocations[index].amount / 100
    return { ...tender, amountTendered: amount, amountApplied: amount }
  })
}

function getAuthorizationAmount(payment, calculatedAmount) {
  return payment?.lineItems?.length && Number.isFinite(calculatedAmount)
    ? calculatedAmount
    : Number(payment?.netAmount) > 0 ? Number(payment.netAmount) : getPaymentTotal(payment)
}

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `pos-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function ensureIdempotencyKey(value) {
  const key = typeof value === 'string' ? value.trim() : ''
  return !key || key.includes('{{') ? createIdempotencyKey() : key
}

const BEFA_TRANSACTION_TYPES = ['PURCHASE', 'PRE_AUTH']
const ACTION_TRANSACTION_TYPES = ['CAPTURE', 'CANCEL_AUTH', 'REFUND', 'REVERSAL']

function transactionTypeLabel(transactionType) {
  return {
    PURCHASE: 'Purchase',
    SALE: 'Sale',
    PRE_AUTH: 'Pre-authorization',
    CAPTURE: 'Capture',
    CANCEL_AUTH: 'Cancel authorization',
    REFUND: 'Refund',
    REVERSAL: 'Reverse',
  }[transactionType] || 'Transaction'
}

function remainingRefundableAmount(transaction) {
  const capturedAmount = Number(transaction.totalAmountPaid || 0)
  const recordedRefundableAmount = Number(transaction.refundableAmount ?? capturedAmount)
  return Math.max(0, Math.min(capturedAmount, recordedRefundableAmount) - Number(transaction.refundedAmount || 0))
}

function isSaleTransaction(transaction) {
  return String(transaction?.businessTransactionType || transaction?.transactionType || '').toUpperCase() === 'SALE'
}

function isActionAvailable(action, transaction) {
  if (!transaction) return true
  const type = String(transaction.transactionType || '').toUpperCase()
  const status = String(transaction.status || '').toUpperCase()
  if (action === 'CAPTURE') {
    return ['PRE_AUTH', 'SALE', 'PURCHASE'].includes(type)
      && ['AUTHORIZED', 'PARTIALLY_CAPTURED'].includes(status)
      && !Boolean(transaction.manualCaptureOccurred)
      && Number(transaction.preauthHoldAmount) > 0
      && Number(transaction.preauthHoldAmount) > Number(transaction.totalAmountPaid || 0)
  }
  if (action === 'CANCEL_AUTH') {
    return type === 'PRE_AUTH' && status === 'AUTHORIZED' && Number(transaction.totalAmountPaid || 0) === 0
  }
  if (action === 'REFUND') {
    return isSaleTransaction(transaction)
      && ['COMPLETED', 'SETTLED', 'CAPTURED', 'PARTIALLY_CAPTURED', 'PARTIALLY_REFUNDED'].includes(status)
      && remainingRefundableAmount(transaction) > 0
  }
  if (action === 'REVERSAL') {
    return ['SALE', 'PURCHASE'].includes(type)
      && status === 'PENDING'
      && !transaction.settledAt
      && !transaction.capturedAt
      && !['REVERSED', 'REFUNDED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(status)
  }
  return false
}

function transactionRequestFrom(
  payment,
  transactionType,
  expiresInHours,
  autoCaptureAmount,
  amountDue,
  pricesIncludeVat,
  applyCustomerFee,
  applyWithholdingVat,
  withholdingCertificateNumber,
  withholdingCertificateDate,
  tenderAmount,
  transactionCurrencyCode,
) {
  const finalAmountDue = tenderAmount && Number(tenderAmount) > 0 ? Number(tenderAmount) : amountDue
  const common = {
    idempotencyKey: payment.idempotencyKey,
    befaPaymentId: payment.befaPaymentId,
    cashRegisterId: payment.cashRegisterId ?? '',
    cashierId: payment.cashierId ?? '',
    customerName: payment.customerName,
    customerTin: payment.customerTin,
    businessTransactionType: payment.businessTransactionType || 'PURCHASE',
    currencyCode: transactionCurrencyCode,
    pricesIncludeVat,
    applyCustomerFee: payment.businessTransactionType === 'SALE' && applyCustomerFee,
    applyWithholdingVat,
    withholdingCertificateNumber: applyWithholdingVat ? withholdingCertificateNumber.trim() : null,
    withholdingCertificateDate: applyWithholdingVat ? withholdingCertificateDate : null,
    paymentTenders: adjustTenderAmounts(payment.paymentTenders || [], finalAmountDue).map((tender) => ({
      paymentMethod: String(tender.paymentMethod || 'CASH').toUpperCase().replaceAll(' ', '_'),
      paymentProvider: tender.paymentProvider || '',
      amountTendered: Number(tender.amountTendered) || 0,
      amountApplied: Number(tender.amountApplied ?? tender.amountTendered) || 0,
    })),
  }

  if (transactionType === 'PRE_AUTH') {
    return {
      ...common,
      preauthHoldAmount: amountDue,
      expiresInHours,
      autoCaptureAmount,
      lineItems: (payment.lineItems || []).map((item) => ({
        itemCode: item.itemCode || '',
        itemName: item.itemName || '',
        unitPrice: Number(item.unitPrice) || 0,
        quantity: Number(item.quantity) || 0,
        discountAmount: Number(item.discountAmount) || 0,
        vatExempt: Boolean(item.vatExempt),
        vatCategory: item.vatCategory || '',
        itemDescription: item.itemDescription || '',
      })),
    }
  }

  return {
    ...common,
    lineItems: (payment.lineItems || []).map((item) => ({
      itemCode: item.itemCode || '',
      itemName: item.itemName || '',
      unitPrice: Number(item.unitPrice) || 0,
      quantity: Number(item.quantity) || 0,
      discountAmount: Number(item.discountAmount) || 0,
      vatExempt: Boolean(item.vatExempt),
      vatCategory: item.vatCategory || '',
    })),
  }
}

function getStatusPresentation(status) {
  const normalized = String(status || '').toUpperCase()
  if (['SETTLED', 'COMPLETED', 'SUCCESS', 'AUTHORIZED', 'AUTHORISED', 'PAID', 'CAPTURED', 'PARTIALLY_CAPTURED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'REVERSED'].includes(normalized)) return { label: getStatusLabel(status), className: getStatusClasses(status), Icon: CheckCircle2 }
  if (['FAILED', 'FAILURE', 'UNSUCCESSFUL', 'UNSUCCESS', 'ERROR', 'DECLINED', 'REJECTED', 'CANCELLED', 'CANCELED'].includes(normalized)) return { label: getStatusLabel(status), className: getStatusClasses(status), Icon: AlertCircle }
  return { label: 'Pending confirmation', className: 'bg-amber-100 text-amber-800', Icon: Clock3 }
}

function isPendingStatus(status) {
  const normalized = String(status || '').trim().toUpperCase()
  return !normalized || ['UNKNOWN', 'PENDING', 'PROCESSING', 'IN_PROGRESS'].includes(normalized)
}

function executionRequestFrom(payment) {
  const request = {
    befaPaymentId: String(payment?.befaPaymentId || '').trim(),
    cashRegisterId: String(payment?.cashRegisterId ?? ''),
    cashierId: String(payment?.cashierId ?? ''),
  }
  const errors = {}
  if (!request.befaPaymentId) errors.befaPaymentId = 'A BEFA payment ID is required.'
  return { request, errors }
}

export default function NewTransaction({ actionsOnly = false }) {
  const location = useLocation()
  const navigate = useNavigate()
  const returnTo = location.state?.from || '/transactions'
  const [transactionType, setTransactionType] = useState(actionsOnly
    ? ''
    : location.state?.transactionType === 'PRE_AUTH' ? 'PRE_AUTH' : 'PURCHASE')
  const [transactionCurrencyCode, setTransactionCurrencyCode] = useState(getCurrencyCode)
  const [expiresInHours, setExpiresInHours] = useState('72')
  const [autoCaptureAmount, setAutoCaptureAmount] = useState('0')
  const [pricesIncludeVat, setPricesIncludeVat] = useState(true)
  const [applyCustomerFee, setApplyCustomerFee] = useState(false)
  const [applyWithholdingVat, setApplyWithholdingVat] = useState(false)
  const [withholdingCertificateNumber, setWithholdingCertificateNumber] = useState('')
  const [withholdingCertificateDate, setWithholdingCertificateDate] = useState('')
  const [requestIds, setRequestIds] = useState({ befaPaymentId: '', cashRegisterId: '', cashierId: '' })
  const [actionSearchValue, setActionSearchValue] = useState(location.state?.transactionId || '')
  const [captureAmount, setCaptureAmount] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [tenderAmount, setTenderAmount] = useState('')
  const [actionReason, setActionReason] = useState('')
  const [actionIdempotencyKey, setActionIdempotencyKey] = useState(createIdempotencyKey)
  const [payment, setPayment] = useState(null)
  const [result, setResult] = useState(null)
  const [loadingPayment, setLoadingPayment] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [validationErrors, setValidationErrors] = useState({})
  const [outcomeUnknown, setOutcomeUnknown] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [health, setHealth] = useState({ status: 'idle', message: 'Ready to load BEFA payment details.' })
  const [pendingTransactions, setPendingTransactions] = useState([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingLoaded, setPendingLoaded] = useState(false)
  const [pendingError, setPendingError] = useState('')
  const [pendingRange, setPendingRange] = useState({ dateFrom: '', dateTo: '' })
  const pendingSectionRef = useRef(null)
  const pendingLoadStarted = useRef(false)
  const [vatRates, setVatRates] = useState([])
  const [serviceFeeRate, setServiceFeeRate] = useState(0.02)
  const [saleWithholdingVatRate, setSaleWithholdingVatRate] = useState(0)
  const [purchaseWithholdingVatRate, setPurchaseWithholdingVatRate] = useState(0)
  const [pricingReady, setPricingReady] = useState(false)
  const [pricingError, setPricingError] = useState('')
  const [notification, setNotification] = useState(null)
  const actionOptions = [
    { value: 'CAPTURE', label: 'Capture pre-authorization' },
    { value: 'CANCEL_AUTH', label: 'Cancel authorization hold' },
    { value: 'REFUND', label: 'Refund Sale' },
    { value: 'REVERSAL', label: 'Reverse transaction' },
  ]
  const handledErrorMessage = loadError
    || submitError
    || Object.values(validationErrors).filter(Boolean).join(' ')

  useEffect(() => {
    if (!handledErrorMessage) return
    setNotification((current) => current?.message === handledErrorMessage
      ? current
      : { type: 'error', message: handledErrorMessage })
  }, [handledErrorMessage])

  const pricingTotals = calculateTotals(
    payment?.lineItems || [],
    pricesIncludeVat,
    payment?.businessTransactionType === 'SALE' && applyCustomerFee,
    vatRates,
    serviceFeeRate,
  )
  const authorizationAmount = getAuthorizationAmount(payment, pricingTotals.totalNet)
  const withholdingVatRate = payment?.businessTransactionType === 'SALE'
    ? saleWithholdingVatRate : purchaseWithholdingVatRate
  const withholdingVatAmount = applyWithholdingVat
    ? Math.round((pricingTotals.totalVat * withholdingVatRate + Number.EPSILON) * 100) / 100
    : 0
  const amountDue = Math.max(0, Math.round((authorizationAmount - withholdingVatAmount + Number.EPSILON) * 100) / 100)
  const inactiveVatCategories = (payment?.lineItems || [])
    .filter((item) => !item.vatExempt
      && !vatRates.some((rate) => rate.categoryCode === item.vatCategory && rate.active))

  // Handle preloaded data from PaymentChannelRouter
  useEffect(() => {
    let active = true
    pricingAPI.get()
      .then(({ data }) => {
        if (!active) return
        setVatRates(data.vatRates)
        setServiceFeeRate(Number(data.serviceFeeRate))
        setSaleWithholdingVatRate(Number(data.saleWithholdingVatRate) || 0)
        setPurchaseWithholdingVatRate(Number(data.purchaseWithholdingVatRate) || 0)
        setPricingReady(true)
      })
      .catch((error) => {
        if (active) setPricingError(getApiErrorMessage(error, 'Unable to load configured VAT and fee rates.'))
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const preloadedData = location.state?.preloadedData
    const preloadedTransactionType = location.state?.transactionType
    
    if (preloadedData) {
      const paymentData = {
        ...preloadedData,
        idempotencyKey: ensureIdempotencyKey(preloadedData.idempotencyKey),
        businessTransactionType: location.state?.businessTransactionType
          || preloadedData.businessTransactionType
          || 'PURCHASE',
      }
      setPayment(paymentData)
      setRequestIds({
        befaPaymentId: paymentData.befaPaymentId || '',
        cashRegisterId: paymentData.cashRegisterId || '',
        cashierId: paymentData.cashierId || '',
      })
      if (preloadedTransactionType) {
        setTransactionType(preloadedTransactionType)
      }
      setHealth({ status: 'ready', message: 'Payment data loaded from router. Ready to process.' })
    }
  }, [location.state])

  const loadPayment = useCallback(async (identifiers = requestIds) => {
    setLoadingPayment(true)
    setHealth({ status: 'checking', message: 'Loading payment details from the backend' })
    setLoadError('')
    setResult(null)
    try {
      const response = await bankPaymentAPI.getBefaPayment(identifiers)
      const request = { ...response.data }
      request.grossAmount = request.grossAmount ?? request.amountInCents
      request.netAmount = request.netAmount ?? request.amountInCents
      request.idempotencyKey = ensureIdempotencyKey(request.idempotencyKey)
      delete request.headers
      request.lineItems = (request.lineItems || []).map((item) => ({ ...item }))
      request.paymentTenders = (request.paymentTenders || []).map((tender) => ({ ...tender }))
      setPayment(request)
      setHealth({ status: 'ready', message: 'BEFA payment details loaded successfully.' })
    } catch (error) {
      setPayment(null)
      setHealth({ status: 'unavailable', message: getApiErrorMessage(error, 'BEFA preview is unavailable.') })
      setLoadError(getApiErrorMessage(error, 'Unable to load the BEFA payment request.'))
    } finally {
      setLoadingPayment(false)
    }
  }, [requestIds])

  const loadPendingTransactions = useCallback(async (range = {}) => {
    setPendingError('')
    if (range.dateFrom && range.dateTo && range.dateFrom > range.dateTo) {
      setPendingTransactions([])
      setPendingError('The start date must be on or before the end date.')
      setPendingLoaded(true)
      return
    }

    pendingLoadStarted.current = true
    setPendingLoading(true)
    const params = {}
    if (range.dateFrom) params.dateFrom = range.dateFrom.length === 16 ? `${range.dateFrom}:00` : range.dateFrom
    if (range.dateTo) params.dateTo = range.dateTo.length === 16 ? `${range.dateTo}:00` : range.dateTo
    try {
      const response = await transactionAPI.getPending(params)
      setPendingTransactions(Array.isArray(response.data) ? response.data : response.data?.content || [])
    } catch (error) {
      setPendingTransactions([])
      setPendingError(getApiErrorMessage(error, 'Unable to load pending transactions.'))
    } finally {
      setPendingLoading(false)
      setPendingLoaded(true)
    }
  }, [])

  useEffect(() => {
    const section = pendingSectionRef.current
    if (!section || pendingLoadStarted.current) return undefined

    const loadWhenVisible = () => {
      if (!pendingLoadStarted.current) loadPendingTransactions()
    }

    if (typeof IntersectionObserver === 'undefined') {
      loadWhenVisible()
      return undefined
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      loadWhenVisible()
    }, { rootMargin: '300px' })
    observer.observe(section)

    return () => observer.disconnect()
  }, [loadPendingTransactions])

  useEffect(() => {
    if (payment && amountDue > 0) {
      setTenderAmount(String(amountDue))
    }
  }, [amountDue, pricesIncludeVat, payment])

  const returnWithNotice = (type, message, transactionResponse = null) => {
    navigate(returnTo, {
      replace: true,
      state: {
        paymentNotice: { type, message },
        transactionResponse,
      },
    })
  }

  const handleRequestSubmit = async (event) => {
    event.preventDefault()
    if (actionsOnly && !ACTION_TRANSACTION_TYPES.includes(transactionType)) {
      setValidationErrors({ transactionType: 'Choose an action before finding a transaction.' })
      return
    }
    if (!BEFA_TRANSACTION_TYPES.includes(transactionType)) {
      const searchId = actionSearchValue.trim()
      if (!searchId) {
        setValidationErrors({ searchId: 'Enter a transaction ID, BEFA payment ID, or bank transaction ID.' })
        return
      }
      setLoadingPayment(true)
      setLoadError('')
      setValidationErrors({})
      setHealth({ status: 'checking', message: 'Loading transaction details from the backend' })
      try {
        const response = await bankPaymentAPI.lookupTransaction(searchId)
        const record = response.data?.body ?? response.data?.data ?? response.data
        if (!record?.transactionId) throw new Error('The backend returned no transaction record.')
        setPayment(record)
        setCaptureAmount(String(Math.max(0, Number(record.preauthHoldAmount ?? record.netAmount ?? 0) - Number(record.totalAmountPaid || 0))))
        setRefundAmount('')
        setActionReason('')
        setActionIdempotencyKey(createIdempotencyKey())
        setHealth({ status: 'ready', message: 'Transaction details loaded successfully.' })
      } catch (error) {
        setPayment(null)
        setHealth({ status: 'unavailable', message: getApiErrorMessage(error, 'Unable to load transaction details.') })
        setLoadError(error.status === 404
          ? 'No transaction matches that ID. Check the transaction ID, BEFA payment ID, or bank transaction ID and try again.'
          : getApiErrorMessage(error, 'Unable to load transaction details.'))
      } finally {
        setLoadingPayment(false)
      }
      return
    }
    const { request, errors } = executionRequestFrom(requestIds)
    setValidationErrors(errors)
    if (Object.keys(errors).length) return
    await loadPayment(request)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!payment || submitting) return
    if (transactionType === 'REFUND' && !isSaleTransaction(payment)) {
      const message = 'Refunds can only be issued against Sale transactions. The selected transaction is a Purchase, so it cannot be refunded here.'
      setNotification({ type: 'warning', message })
      setSubmitError(message)
      return
    }
    if (actionsOnly && !ACTION_TRANSACTION_TYPES.includes(transactionType)) {
      setValidationErrors({ transactionType: 'Choose an action before continuing.' })
      return
    }
    if (actionsOnly && !actionAvailable) {
      const message = transactionType === 'CAPTURE'
        ? 'Capture is available only for an authorized pre-authorization.'
        : transactionType === 'CANCEL_AUTH'
          ? 'Cancel authorization is available only for an uncaptured authorized pre-authorization.'
          : transactionType === 'REFUND'
        ? 'Refunds require a captured Sale transaction with a remaining refundable balance. Select an eligible Sale transaction to continue.'
        : 'This transaction cannot be reversed in its current status.'
      setNotification({ type: 'warning', message })
      setSubmitError(message)
      return
    }
    if (!actionsOnly && usesBefaPreview && !pricingReady) {
      setSubmitError(pricingError || 'Pricing settings are not available. Reload before processing this payment.')
      return
    }
    if (!actionsOnly && usesBefaPreview && inactiveVatCategories.length > 0) {
      setValidationErrors({ pricing: `No active VAT rate is configured for ${inactiveVatCategories[0].vatCategory || 'a line item'}.` })
      return
    }
    if (transactionType === 'CAPTURE' && (!Number.isFinite(Number(captureAmount))
      || Math.round(Number(captureAmount) * 100) !== Number(captureAmount) * 100
      || !(Number(captureAmount) > 0))) {
      setValidationErrors({ captureAmount: 'Capture amount must be positive with up to two decimal places.' })
      return
    }
    if (transactionType === 'CAPTURE'
        && Number(captureAmount) > Number(payment.preauthHoldAmount || 0) - Number(payment.totalAmountPaid || 0)) {
      setValidationErrors({ captureAmount: 'Capture amount cannot exceed the remaining authorization.' })
      return
    }
    if (transactionType === 'REFUND'
        && (!Number.isFinite(Number(refundAmount))
          || Math.round(Number(refundAmount) * 100) !== Number(refundAmount) * 100
          || !(Number(refundAmount) > 0))) {
      setValidationErrors({ refundAmount: 'Refund amount must be positive with up to two decimal places.' })
      return
    }
    if (transactionType === 'REFUND' && Number(refundAmount) > remainingRefundableAmount(payment)) {
      setValidationErrors({
        refundAmount: `Refund amount cannot exceed the remaining captured balance of ${formatCurrency(remainingRefundableAmount(payment), payment.currencyCode)}.`,
      })
      return
    }
    if (transactionType === 'PRE_AUTH' && (!Number.isInteger(Number(expiresInHours)) || Number(expiresInHours) < 1)) {
      setValidationErrors({ expiresInHours: 'Expiry duration must be a whole number of at least 1 hour.' })
      return
    }
    if (transactionType === 'PRE_AUTH'
        && (!Number.isFinite(Number(autoCaptureAmount))
          || Math.round(Number(autoCaptureAmount) * 100) !== Number(autoCaptureAmount) * 100
          || Number(autoCaptureAmount) < 0
          || Number(autoCaptureAmount) > amountDue)) {
      setValidationErrors({ autoCaptureAmount: 'Automatic capture must be an amount with up to two decimals, between zero and the authorization amount.' })
      return
    }
    if (usesBefaPreview && applyWithholdingVat
        && (!withholdingVatRate || !withholdingCertificateNumber.trim() || !withholdingCertificateDate
          || !isValidCalendarDate(withholdingCertificateDate))) {
      setValidationErrors({
        withholdingVat: !withholdingVatRate
          ? 'A withholding VAT rate must be configured before this option can be used.'
          : !withholdingCertificateNumber.trim() || !withholdingCertificateDate
            ? 'Enter the withholding certificate number and date.'
            : 'Enter a valid certificate date with a four-digit year, month 1–12, and day 1–31.',
      })
      return
    }
    if (usesBefaPreview && transactionType === 'PRE_AUTH' && applyWithholdingVat
        && Number(autoCaptureAmount) > 0 && Number(autoCaptureAmount) !== amountDue) {
      setValidationErrors({ autoCaptureAmount: 'Withholding VAT pre-authorizations must automatically capture the full cash/card balance or zero.' })
      return
    }
      setSubmitting(true)
    setSubmitError('')
    try {
      let response
      if (transactionType === 'PURCHASE' || transactionType === 'PRE_AUTH') {
        const { request, errors } = executionRequestFrom(payment)
        setValidationErrors(errors)
        if (Object.keys(errors).length) return
        const transactionRequest = transactionRequestFrom(
          { ...payment, ...request },
          transactionType,
          Number(expiresInHours),
          Number(autoCaptureAmount),
          amountDue,
          pricesIncludeVat,
          applyCustomerFee,
          applyWithholdingVat,
          withholdingCertificateNumber,
          withholdingCertificateDate,
          tenderAmount,
          transactionCurrencyCode,
        )
        response = transactionType === 'PRE_AUTH'
          ? await transactionAPI.preAuth(transactionRequest)
          : await transactionAPI.create(transactionRequest)
      } else if (transactionType === 'CAPTURE') {
        response = await transactionAPI.capture(payment.transactionId, {
          idempotencyKey: actionIdempotencyKey,
          captureAmount: Number(captureAmount),
        })
      } else if (transactionType === 'CANCEL_AUTH') {
        response = await transactionAPI.cancel(payment.transactionId, {
          idempotencyKey: actionIdempotencyKey,
          reason: actionReason || undefined,
        })
      } else if (transactionType === 'REFUND') {
        response = await transactionAPI.refund(payment.transactionId, {
          idempotencyKey: actionIdempotencyKey,
          refundAmount: Number(refundAmount),
          reason: actionReason || undefined,
        })
      } else {
        response = await transactionAPI.reverse(payment.transactionId, {
          idempotencyKey: actionIdempotencyKey,
          reason: actionReason || undefined,
        })
      }
      const transaction = response.data?.body ?? response.data?.data ?? response.data
      setResult(transaction)
      const resultStatus = String(transaction?.status || '').toUpperCase()
      const successfulStatuses = {
        PURCHASE: ['SETTLED', 'COMPLETED', 'SUCCESS', 'AUTHORIZED', 'AUTHORISED', 'PAID'],
        PRE_AUTH: ['AUTHORIZED', 'AUTHORISED', 'PENDING'],
        CAPTURE: ['CAPTURED', 'PARTIALLY_CAPTURED', 'COMPLETED', 'SETTLED'],
        CANCEL_AUTH: ['CANCELLED'],
        REFUND: ['REFUNDED', 'PARTIALLY_REFUNDED'],
        REVERSAL: ['REVERSED'],
      }
      if (successfulStatuses[transactionType]?.includes(resultStatus)) {
        returnWithNotice('success', `${transactionTypeLabel(transactionType)} transaction completed successfully.`, transaction)
      } else if (['FAILED', 'FAILURE', 'UNSUCCESSFUL', 'UNSUCCESS', 'ERROR', 'DECLINED', 'REJECTED', 'CANCELLED', 'CANCELED'].includes(resultStatus)) {
        returnWithNotice('error', `Transaction failed${transaction?.message ? `: ${transaction.message}` : '.'}`, transaction)
      }
      await loadPendingTransactions(pendingRange)
    } catch (error) {
      if (!error.status || error.status >= 500) setOutcomeUnknown(true)
      else {
        const errorResponse = error.response?.data?.body ?? error.response?.data ?? { message: getApiErrorMessage(error, 'Unable to process this transaction.') }
        returnWithNotice('error', `Transaction action failed: ${getApiErrorMessage(error, 'Unable to process this transaction.')}`, errorResponse)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const checkPaymentStatus = async () => {
    if (!payment?.befaPaymentId) return
    setCheckingStatus(true)
    setSubmitError('')
    try {
      const response = await bankPaymentAPI.getStatus(payment.befaPaymentId)
      setResult(response.data?.body ?? response.data?.data ?? response.data)
      setOutcomeUnknown(false)
      await loadPendingTransactions(pendingRange)
    } catch (error) {
      if (error.status === 404) setSubmitError('No transaction has been recorded for this BEFA payment yet. Wait for the reconciliation window before starting a new payment.')
      else setSubmitError(getApiErrorMessage(error, 'Unable to check this payment status.'))
    } finally {
      setCheckingStatus(false)
    }
  }
  const status = result ? getStatusPresentation(result.status) : null
  const StatusIcon = status?.Icon
  const usesBefaPreview = BEFA_TRANSACTION_TYPES.includes(transactionType)
  const selectedTypeLabel = transactionTypeLabel(transactionType)
  const actionAvailable = isActionAvailable(transactionType, payment)
  const displayedTenders = payment
    ? usesBefaPreview
      ? adjustTenderAmounts(payment.paymentTenders || [], amountDue)
      : payment.paymentTenders || []
    : []
  const displayedPaymentTotal = getPaymentTotal({ ...payment, paymentTenders: displayedTenders })

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {notification && (
        <PersistentNotification
          type={notification.type}
          message={notification.message}
          onClose={() => setNotification(null)}
          duration={3000}
        />
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/search" className="mb-3 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" /> Search
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{actionsOnly ? 'Transaction actions' : 'New transaction'}</h1>
          <p className="mt-1 text-gray-500">{actionsOnly
            ? 'Choose an operation, then find the Sale or Purchase it applies to.'
            : 'Create a purchase or pre-authorization. Use Transaction actions to manage an existing transaction.'}</p>
        </div>
        <div className={`flex max-w-xl items-start gap-2 rounded-lg border px-3 py-2 text-sm ${health.status === 'ready' ? 'border-blue-200 bg-blue-50 text-blue-800' : health.status === 'checking' ? 'border-gray-200 bg-white text-gray-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`} role="status">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{health.message}</span>
        </div>
      </div>

      {usesBefaPreview && paymentIntegrationConfig.mode === 'fixtures' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="note">
          <strong>Fixture preview:</strong> the backend supplies the BEFA details from local test data. No live BEFA request is made.
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>{payment ? `${selectedTypeLabel} details` : usesBefaPreview ? 'Find a BEFA payment' : `Find a transaction for ${selectedTypeLabel.toLowerCase()}`}</CardTitle>
            <p className="mt-1 text-sm text-gray-500">{payment
              ? `Review this ${transactionTypeLabel(String(payment.transactionType || '').toUpperCase())} before applying ${selectedTypeLabel.toLowerCase()}.`
              : usesBefaPreview ? 'Enter the BEFA payment ID and any available register details.' : 'Search by transaction ID, BEFA payment ID, or bank transaction ID.'}</p>
          </div>
          {payment && <Button type="button" variant="outline" size="sm" onClick={handleRequestSubmit} disabled={loadingPayment || submitting || outcomeUnknown}>
            <RefreshCw className="mr-2 h-4 w-4" /> Reload details
          </Button>}
        </CardHeader>
        <CardContent>
          {actionsOnly && !payment && (
            <div className="mb-5 max-w-sm">
              <Field label="Choose action">
                <select
                  value={transactionType}
                  onChange={(event) => {
                    setTransactionType(event.target.value)
                    setPayment(null)
                    setResult(null)
                    setLoadError('')
                    setSubmitError('')
                    setValidationErrors({})
                    setActionIdempotencyKey(createIdempotencyKey())
                  }}
                  disabled={submitting || outcomeUnknown}
                  className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Choose an action</option>
                  {actionOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                {validationErrors.transactionType && <span className="mt-1 block text-xs text-red-700" role="alert">{validationErrors.transactionType}</span>}
              </Field>
            </div>
          )}
          {!actionsOnly && transactionType === 'PRE_AUTH' && (
            <div className="mb-5 max-w-sm">
              <Field label="Authorization expiry (hours)">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={expiresInHours}
                  onChange={(event) => setExpiresInHours(event.target.value)}
                  aria-describedby="preauth-expiry-help"
                />
                <span id="preauth-expiry-help" className="mt-1 block text-xs text-gray-500">
                  Default is 72 hours. If no manual capture is made, the configured automatic amount is processed when this hold expires.
                </span>
                {validationErrors.expiresInHours && <span className="mt-1 block text-xs text-red-700" role="alert">{validationErrors.expiresInHours}</span>}
              </Field>
            </div>
          )}
          {!actionsOnly && transactionType === 'PRE_AUTH' && (
            <Card className="mb-5 max-w-2xl border-blue-200 bg-blue-50/60">
              <CardContent className="space-y-3 p-4">
                <div>
                  <p className="font-semibold text-gray-900">Automatic capture at expiry</p>
                  <p className="mt-1 text-sm text-gray-600">
                    Enter 0 to capture nothing automatically. One manual capture before expiry overrides this scheduled amount and releases any unused authorization.
                  </p>
                </div>
                <Field label="Automatic capture amount">
                  <Input
                    type="number"
                    min="0"
                    max={amountDue}
                    step="0.01"
                    value={autoCaptureAmount}
                    onChange={(event) => setAutoCaptureAmount(event.target.value)}
                    aria-describedby="auto-capture-help"
                  />
                  <span id="auto-capture-help" className="mt-1 block text-xs text-gray-500">
                    Maximum authorization: {formatCurrency(amountDue, transactionCurrencyCode)}.
                    {applyWithholdingVat
                      ? ' Withholding VAT pre-authorizations must capture the full cash/card balance or zero.'
                      : ' A partial automatic capture releases the unused remainder when the authorization expires.'}
                  </span>
                  {validationErrors.autoCaptureAmount && <span className="mt-1 block text-xs text-red-700" role="alert">{validationErrors.autoCaptureAmount}</span>}
                </Field>
              </CardContent>
            </Card>
          )}
          {loadError && <ErrorNotice message={loadError} onRetry={() => (usesBefaPreview ? loadPayment(requestIds) : handleRequestSubmit({ preventDefault() {} }))} />}
          {loadingPayment ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500" role="status">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading payment request
            </div>
          ) : payment ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              {usesBefaPreview && (
                <section className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/60 p-4">
                  <div className="max-w-md">
                    <CurrencySelect
                      id="purchase-transaction-currency"
                      value={transactionCurrencyCode}
                      onChange={setTransactionCurrencyCode}
                    />
                    <p className="mt-1 text-xs text-gray-600">The selected currency and entered amount are saved as-is. No exchange conversion is applied.</p>
                  </div>
                  <label className="flex items-start gap-3 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      checked={pricesIncludeVat}
                      onChange={(event) => setPricesIncludeVat(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#9B2635] focus:ring-[#9B2635]"
                    />
                    <span>
                      <span className="font-medium">Entered prices already include VAT</span>
                      <span className="mt-1 block text-xs text-gray-600">
                        <span className="block">Checked: VAT is already included in the fetched prices and won’t be added again.</span>
                        <span className="block">Unchecked: VAT will be added to the fetched prices.</span>
                      </span>
                    </span>
                  </label>
                  {payment.businessTransactionType === 'SALE' && (
                    <label className="flex items-start gap-3 text-sm text-gray-800">
                      <input
                        type="checkbox"
                        checked={applyCustomerFee}
                        onChange={(event) => setApplyCustomerFee(event.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#9B2635] focus:ring-[#9B2635]"
                      />
                      <span>
                        <span className="font-medium">Apply customer service fee ({(serviceFeeRate * 100).toFixed(2)}%)</span>
                        <span className="mt-1 block text-xs text-gray-600">Optional Sale-only surcharge; unchecked by default.</span>
                      </span>
                    </label>
                  )}
                  {payment.businessTransactionType === 'SALE' || payment.businessTransactionType === 'PURCHASE' ? (
                    <div className="space-y-3 border-t border-blue-200 pt-3">
                      <label className="flex items-start gap-3 text-sm text-gray-800">
                        <input
                          type="checkbox"
                          checked={applyWithholdingVat}
                          onChange={(event) => setApplyWithholdingVat(event.target.checked)}
                          disabled={!withholdingVatRate}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#9B2635] focus:ring-[#9B2635] disabled:opacity-50"
                        />
                        <span>
                          <span className="font-medium">Apply withholding VAT ({(withholdingVatRate * 100).toFixed(2)}%)</span>
                          <span className="mt-1 block text-xs text-gray-600">Calculated from the VAT amount. The full invoice total remains recorded; withholding reduces the cash/card amount due.</span>
                        </span>
                      </label>
                      {applyWithholdingVat && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Withholding certificate number">
                            <Input
                              value={withholdingCertificateNumber}
                              onChange={(event) => setWithholdingCertificateNumber(event.target.value)}
                              maxLength={120}
                              required
                              autoComplete="off"
                            />
                          </Field>
                          <Field label="Withholding certificate date">
                            <Input
                              type="date"
                              min="0001-01-01"
                              max="9999-12-31"
                              value={withholdingCertificateDate}
                              onChange={(event) => setWithholdingCertificateDate(event.target.value)}
                              required
                              aria-invalid={Boolean(validationErrors.withholdingVat && withholdingCertificateDate)}
                            />
                          </Field>
                        </div>
                      )}
                      {validationErrors.withholdingVat && <p className="text-sm text-red-700" role="alert">{validationErrors.withholdingVat}</p>}
                    </div>
                  ) : null}
                </section>
              )}
              {usesBefaPreview && (
                <section className="rounded-lg border border-gray-200 bg-gray-50 p-4" aria-label="Calculated payment amounts">
                  <h2 className="mb-3 text-sm font-semibold text-gray-900">Calculated amount</h2>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-4"><dt className="text-gray-600">Subtotal before VAT</dt><dd className="font-medium text-gray-900">{formatCurrency(pricingTotals.totalGross, transactionCurrencyCode)}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-gray-600">VAT</dt><dd className="font-medium text-gray-900">{formatCurrency(pricingTotals.totalVat, transactionCurrencyCode)}</dd></div>
                    {applyWithholdingVat && (
                      <div className="flex justify-between gap-4 text-amber-800"><dt>Withholding VAT</dt><dd className="font-medium">−{formatCurrency(withholdingVatAmount, transactionCurrencyCode)}</dd></div>
                    )}
                    <div className="flex justify-between gap-4"><dt className="text-gray-600">Customer service fee</dt><dd className="font-medium text-gray-900">{formatCurrency(pricingTotals.totalServiceFee, transactionCurrencyCode)}</dd></div>
                    <div className="flex justify-between gap-4 border-t border-gray-200 pt-2"><dt className="font-semibold text-gray-800">Invoice total</dt><dd className="font-bold text-gray-900">{formatCurrency(authorizationAmount, transactionCurrencyCode)}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="font-semibold text-gray-800">Cash/card due / authorization hold</dt><dd className="font-bold text-gray-900">{formatCurrency(amountDue, transactionCurrencyCode)}</dd></div>
                  </dl>
                  {pricingError && <p className="mt-3 text-sm text-red-700" role="alert">{pricingError}</p>}
                  {validationErrors.pricing && <p className="mt-3 text-sm text-red-700" role="alert">{validationErrors.pricing}</p>}
                  {pricingReady && inactiveVatCategories.length > 0 && (
                    <p className="mt-3 text-sm text-red-700" role="alert">
                      No active VAT rate is configured for {inactiveVatCategories[0].vatCategory || 'a line item'}.
                    </p>
                  )}
                  {!pricingReady && !pricingError && <p className="mt-3 text-sm text-gray-500">Loading tax and fee settings...</p>}
                </section>
              )}
              <section aria-labelledby="request-details-heading">
                <h2 id="request-details-heading" className="mb-3 text-sm font-semibold text-gray-900">Request details</h2>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {usesBefaPreview ? <Info label="BEFA payment ID" value={payment.befaPaymentId} /> : <Info label="Transaction ID" value={payment.transactionId} />}
                  {!usesBefaPreview && <Info label="Transaction type" value={transactionTypeLabel(String(payment.transactionType || '').toUpperCase())} />}
                  <Info label="Status" value={getStatusLabel(payment.status)} />
                  {payment.preauthHoldAmount != null && <Info label="Authorization hold" value={formatCurrency(payment.preauthHoldAmount, usesBefaPreview ? transactionCurrencyCode : payment.currencyCode)} />}
                  {payment.preauthExpiresAt && <Info label="Authorization expiry" value={formatDateTime(payment.preauthExpiresAt)} />}
                  {payment.autoCaptureAmount != null && <Info label="Automatic capture at expiry" value={formatCurrency(payment.autoCaptureAmount, usesBefaPreview ? transactionCurrencyCode : payment.currencyCode)} />}
                  {payment.preauthReleaseReference && <Info label="Authorization release reference" value={payment.preauthReleaseReference} />}
                  <Info label="Cash register" value={payment.cashRegisterId} />
                  <Info label="Cashier" value={payment.cashierId} />
                  <Info label="Customer" value={payment.customerName || 'Guest'} />
                  <Info label="TIN (TAX Identification number)" value={payment.customerTin || payment.tin || 'Not provided'} />
                  <Info label="Bank transaction ID" value={payment.bankTransactionId} />
                  <Info label="Fiscal reference" value={payment.fiscalReference} />
                  <Info label="Fiscal signature" value={payment.fiscalSignature} />
                  <Info label="Fiscal submission status" value={payment.fiscalSubmissionStatus} />
                  <Info label="Fiscal submission mode" value={payment.fiscalSubmissionMode} />
                  <Info label="Authority response code" value={payment.fiscalAuthorityResponseCode} />
                  <Info label="Authority response" value={payment.fiscalAuthorityResponseMessage} />
                  <Info label="Fiscal submission time" value={payment.fiscalSubmittedToAuthorityAt ? formatDateTime(payment.fiscalSubmittedToAuthorityAt) : undefined} />
                </dl>
              </section>

              <section aria-labelledby="items-heading">
                <h2 id="items-heading" className="mb-3 text-sm font-semibold text-gray-900">Items</h2>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Code</th><th className="px-4 py-3 text-right">Quantity</th><th className="px-4 py-3 text-right">Unit price</th><th className="px-4 py-3">VAT</th></tr>
                    </thead>
                    <tbody>
                      {(payment.lineItems || []).map((item, index) => (
                        <tr key={`${item.itemCode || 'item'}-${index}`} className="border-t border-gray-100">
                          <td className="px-4 py-3 font-medium text-gray-900">{item.itemName || 'Item'}</td>
                          <td className="px-4 py-3 text-gray-600">{item.itemCode || '-'}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{Number(item.quantity || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(item.unitPrice, usesBefaPreview ? transactionCurrencyCode : payment.currencyCode)}</td>
                          <td className="px-4 py-3 text-gray-600">{item.vatExempt ? 'Exempt' : item.vatCategory || 'Standard'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section aria-labelledby="tenders-heading">
                <h2 id="tenders-heading" className="mb-3 text-sm font-semibold text-gray-900">Payment breakdown</h2>
                <div className="space-y-2">
                  {displayedTenders.map((tender, index) => (
                    <div key={`${tender.paymentMethod || 'tender'}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 px-4 py-3">
                      <div><p className="text-sm font-medium text-gray-900">{tender.paymentMethod || 'Payment'}</p><p className="text-xs text-gray-500">{tender.paymentProvider || 'Provider not specified'}</p></div>
                      <p className="font-semibold text-gray-900">{formatCurrency(tender.amountTendered, usesBefaPreview ? transactionCurrencyCode : payment.currencyCode)}</p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                    <span className="text-sm font-semibold text-gray-700">Total tendered</span>
                    <span className="text-lg font-bold text-gray-900">{formatCurrency(displayedPaymentTotal, usesBefaPreview ? transactionCurrencyCode : payment.currencyCode)}</span>
                  </div>
                </div>
              </section>

              {payment.captures?.length > 0 && (
                <section aria-labelledby="capture-history-heading">
                  <h2 id="capture-history-heading" className="mb-3 text-sm font-semibold text-gray-900">Capture history</h2>
                  <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                    {payment.captures.map((capture) => (
                      <div key={capture.idempotencyKey} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                        <div>
                          <p className="font-medium text-gray-900">{capture.operationType === 'AUTO_EXPIRY' ? 'Automatic capture at expiry' : 'Manual capture'}</p>
                          <p className="text-xs text-gray-500">{capture.createdAt ? formatDateTime(capture.createdAt) : 'Date unavailable'}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">{formatCurrency(capture.amount, payment.currencyCode)}</p>
                          <p className="text-xs text-gray-500">Captured total: {formatCurrency(capture.cumulativeAmount, payment.currencyCode)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {transactionType === 'CAPTURE' &&               <Field label="Amount to capture now">
              <Input type="number" min="0.01" max={Math.max(0, Number(payment?.preauthHoldAmount || 0) - Number(payment?.totalAmountPaid || 0))} step="0.01" value={captureAmount} onChange={(event) => setCaptureAmount(event.target.value)} aria-invalid={Boolean(validationErrors.captureAmount)} />
                <span className="block text-xs text-gray-500">
                Remaining authorization: {formatCurrency(Math.max(0, Number(payment?.preauthHoldAmount || 0) - Number(payment?.totalAmountPaid || 0)), payment.currencyCode)}. One manual capture closes the authorization; any unused hold is released and the scheduled expiry amount is cancelled.
                </span>
                {validationErrors.captureAmount && <span className="block text-xs text-red-700">{validationErrors.captureAmount}</span>}
              </Field>}
              {transactionType === 'CAPTURE' && Number(payment?.autoCaptureAmount || 0) > 0 && !payment?.manualCaptureOccurred && (
                <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                  Scheduled expiry capture: {formatCurrency(payment.autoCaptureAmount, payment.currencyCode)}. Capturing manually now will cancel that scheduled amount.
                </p>
              )}
              {transactionType === 'REFUND' && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Refund amount">
                  <Input type="number" min="0.01" max={remainingRefundableAmount(payment)} step="0.01" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} aria-invalid={Boolean(validationErrors.refundAmount)} />
                  <span className="block text-xs text-gray-500">
                    Remaining captured amount available to refund: {formatCurrency(remainingRefundableAmount(payment), payment.currencyCode)}.
                  </span>
                  {validationErrors.refundAmount && <span className="block text-xs text-red-700">{validationErrors.refundAmount}</span>}
                </Field>
                <Field label="Reason (optional)"><Input value={actionReason} onChange={(event) => setActionReason(event.target.value)} /></Field>
              </div>}
              {transactionType === 'CANCEL_AUTH' && <Field label="Reason (optional)"><Input value={actionReason} onChange={(event) => setActionReason(event.target.value)} /></Field>}
              {transactionType === 'REVERSAL' && <Field label="Reason (optional)"><Input value={actionReason} onChange={(event) => setActionReason(event.target.value)} /></Field>}
              {transactionType === 'PURCHASE' && isSaleTransaction(payment) && <Field label="Tender amount">
                <Input type="number" min="0.01" step="0.01" value={tenderAmount} onChange={(event) => setTenderAmount(event.target.value)} aria-invalid={Boolean(validationErrors.tenderAmount)} />
                <span className="block text-xs text-gray-500">
                  Net amount due based on current VAT settings. This updates automatically when VAT checkbox is toggled.
                </span>
                {validationErrors.tenderAmount && <span className="block text-xs text-red-700">{validationErrors.tenderAmount}</span>}
              </Field>}

              {actionsOnly && !actionAvailable && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
                  {transactionType === 'CAPTURE'
                    ? 'Capture is available only for an authorized pre-authorization.'
                    : transactionType === 'CANCEL_AUTH'
                      ? 'Cancel authorization is available only for an uncaptured authorized pre-authorization.'
                      : transactionType === 'REFUND'
                      ? 'Refunds require a captured Sale transaction with a remaining refundable balance. Select an eligible Sale transaction to continue.'
                      : 'This transaction cannot be reversed in its current status.'}
                </p>
              )}
              <div className="flex flex-col justify-between gap-4 border-t border-gray-200 pt-5 sm:flex-row sm:items-center">
                <p className="max-w-2xl text-sm text-gray-500">{transactionType === 'PRE_AUTH' ? 'Create an authorization hold for this payment.' : transactionType === 'PURCHASE' ? 'Create and complete a purchase using the loaded BEFA items and tenders.' : `Apply ${selectedTypeLabel.toLowerCase()} to the loaded transaction.`}</p>
                <Button type="submit" disabled={submitting || outcomeUnknown || (!actionsOnly && usesBefaPreview && (!pricingReady || inactiveVatCategories.length > 0)) || (actionsOnly && !ACTION_TRANSACTION_TYPES.includes(transactionType))}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {submitting ? 'Processing...' : transactionType === 'PURCHASE' ? 'Create purchase' : transactionType === 'PRE_AUTH' ? 'Create pre-authorization' : `Apply ${selectedTypeLabel.toLowerCase()}`}
                </Button>
              </div>
              {Object.keys(validationErrors).length > 0 && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert"><p className="font-semibold">This payment request cannot be submitted.</p><ul className="mt-1 list-disc pl-5">{Object.values(validationErrors).map((message) => <li key={message}>{message}</li>)}</ul></div>}
              <ErrorNotice message={submitError} />
            </form>
          ) : (
            <form onSubmit={handleRequestSubmit} className={`grid grid-cols-1 items-end gap-4 ${usesBefaPreview ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-[minmax(0,1fr)_auto]'}`}>
              {usesBefaPreview ? <>
                <Field label="BEFA payment ID">
                  <Input value={requestIds.befaPaymentId} onChange={(event) => setRequestIds((current) => ({ ...current, befaPaymentId: event.target.value }))} aria-invalid={Boolean(validationErrors.befaPaymentId)} aria-describedby={validationErrors.befaPaymentId ? 'befa-payment-id-error' : undefined} />
                  {validationErrors.befaPaymentId && <span id="befa-payment-id-error" className="block text-xs text-red-700">{validationErrors.befaPaymentId}</span>}
                </Field>
                <Field label="Cash register ID (optional)"><Input value={requestIds.cashRegisterId} onChange={(event) => setRequestIds((current) => ({ ...current, cashRegisterId: event.target.value }))} /></Field>
                <Field label="Cashier ID (optional)"><Input value={requestIds.cashierId} onChange={(event) => setRequestIds((current) => ({ ...current, cashierId: event.target.value }))} /></Field>
              </> : <div className="w-full max-w-md"><Field label="Transaction identifier">
                <Input
                  value={actionSearchValue}
                  placeholder="Transaction ID, BEFA payment ID, or bank transaction ID"
                  onChange={(event) => setActionSearchValue(event.target.value)}
                  aria-invalid={Boolean(validationErrors.searchId)}
                  aria-describedby={validationErrors.searchId ? 'transaction-search-error' : undefined}
                />
                {validationErrors.searchId && <span id="transaction-search-error" className="block text-xs text-red-700">{validationErrors.searchId}</span>}
              </Field></div>}
              <div className={usesBefaPreview ? 'sm:col-span-2 lg:col-span-3' : ''}>
                <Button type="submit" disabled={loadingPayment}>
                  {loadingPayment
                    ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />{usesBefaPreview ? 'Loading BEFA payment' : 'Loading transaction'}</>
                    : usesBefaPreview ? 'Load BEFA details' : 'Load transaction'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {outcomeUnknown && <section className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950" role="alert"><h2 className="font-semibold">Transaction outcome is unknown</h2><p className="mt-1">The browser did not receive a final result. Check the transaction status before retrying the same request.</p><div className="mt-3 flex flex-wrap gap-3"><Button type="button" variant="outline" size="sm" onClick={checkPaymentStatus} disabled={checkingStatus}>{checkingStatus ? 'Checking status...' : 'Check status'}</Button><Button type="button" variant="outline" size="sm" onClick={() => handleSubmit({ preventDefault() {} })} disabled={submitting}>Retry same request</Button><Link className="font-semibold text-amber-950 underline" to="/bank-payments">View pending payments</Link></div></section>}
      {result && status && (
        <Card>
          <CardHeader><CardTitle>{selectedTypeLabel} result</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Info label="Transaction reference" value={result.transactionId} />
              <div className="rounded-lg border border-gray-200 p-3"><dt className="text-xs text-gray-500">Status</dt><dd className="mt-1"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}><StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />{status.label}</span></dd></div>
              <Info label="Amount" value={formatCurrency(result.netAmount, result.currencyCode)} />
              <Info label="Created" value={formatDateTime(result.createdAt)} />
              {transactionType === 'PRE_AUTH' && <>
                <Info label="TIN (TAX Identification number)" value={result.customerTin || result.tin || payment?.customerTin || payment?.tin || 'Not provided'} />
                <Info label="Authorization hold" value={formatCurrency(result.preauthHoldAmount ?? amountDue, result.currencyCode || transactionCurrencyCode)} />
                <Info label="Automatic capture at expiry" value={formatCurrency(result.autoCaptureAmount ?? autoCaptureAmount, result.currencyCode || transactionCurrencyCode)} />
                <Info label="Bank transaction ID" value={result.bankTransactionId || payment?.bankTransactionId} />
                <Info label="Fiscal reference" value={result.fiscalReference} />
                <Info label="Fiscal signature" value={result.fiscalSignature} />
                <Info label="Fiscal submission status" value={result.fiscalSubmissionStatus} />
                <Info label="Fiscal submission mode" value={result.fiscalSubmissionMode} />
                <Info label="Authority response code" value={result.fiscalAuthorityResponseCode} />
                <Info label="Authority response" value={result.fiscalAuthorityResponseMessage} />
                <Info label="Fiscal submission time" value={result.fiscalSubmittedToAuthorityAt ? formatDateTime(result.fiscalSubmittedToAuthorityAt) : undefined} />
              </>}
            </dl>
            {isPendingStatus(result.status) && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">The transaction is pending confirmation. Check its status before retrying.</p>}
            {result.transactionId && <Link className="inline-flex text-sm font-semibold text-[#9B2635] hover:text-[#7D1E2A]" to={`/transactions/${encodeURIComponent(result.transactionId)}`}>Open transaction details</Link>}
          </CardContent>
        </Card>
      )}

      <div ref={pendingSectionRef}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div><CardTitle>Pending transactions</CardTitle><p className="mt-1 text-sm text-gray-500">Review pending records before retrying a payment.</p></div>
          <Button type="button" variant="outline" size="sm" onClick={() => loadPendingTransactions(pendingRange)} disabled={pendingLoading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); loadPendingTransactions(pendingRange) }}>
            <Field label="Date from"><Input type="datetime-local" value={pendingRange.dateFrom} onChange={(event) => setPendingRange((current) => ({ ...current, dateFrom: event.target.value }))} /></Field>
            <Field label="Date to"><Input type="datetime-local" value={pendingRange.dateTo} onChange={(event) => setPendingRange((current) => ({ ...current, dateTo: event.target.value }))} /></Field>
            <Button type="submit" variant="outline" disabled={pendingLoading}>Apply dates</Button>
          </form>
          <ErrorNotice message={pendingError} onRetry={() => loadPendingTransactions(pendingRange)} />
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-gray-50 text-gray-500"><tr><th className="px-3 py-2 font-medium">Transaction ID</th><th className="px-3 py-2 font-medium">Customer</th><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 text-right font-medium">Amount</th><th className="px-3 py-2 font-medium">Created</th></tr></thead>
              <tbody>
                {pendingLoading ? <tr><td colSpan="5" className="px-3 py-8 text-center text-gray-500" role="status"><span className="inline-flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Loading pending transactions</span></td></tr>
                  : !pendingLoaded ? <tr><td colSpan="5" className="px-3 py-8 text-center text-gray-500">Pending transactions load when this section is reached.</td></tr>
                    : pendingTransactions.length === 0 ? <tr><td colSpan="5" className="px-3 py-8 text-center text-gray-500">No pending transactions found.</td></tr>
                    : pendingTransactions.map((transaction) => <tr key={transaction.transactionId} className="border-t border-gray-100"><td className="px-3 py-3 font-medium text-gray-900">{transaction.transactionId}</td><td className="px-3 py-3">{transaction.customerName || 'Guest'}</td><td className="px-3 py-3">{transaction.transactionType || '-'}</td><td className="px-3 py-3 text-right">{formatCurrency(transaction.netAmount, transaction.currencyCode)}</td><td className="px-3 py-3">{formatDateTime(transaction.createdAt)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return <div className="space-y-1.5"><label className="block text-sm font-medium text-gray-700">{label}{children}</label></div>
}

function Info({ label, value, mono = false }) {
  return <div className="min-w-0 rounded-lg border border-gray-200 p-3"><dt className="text-xs text-gray-500">{label}</dt><dd className={`mt-1 break-all text-sm font-medium text-gray-900 ${mono ? 'font-mono text-xs' : ''}`}>{value || '-'}</dd></div>
}
