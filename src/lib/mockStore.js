const STORAGE_KEY = 'pos-tax-vat.transactions.v1'

let memoryTransactions = []

const roundMoney = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100

function configuredVatRates() {
  const defaults = [
    { categoryCode: 'STANDARD', rate: 0.15, active: true },
    { categoryCode: 'REDUCED', rate: 0.05, active: true },
    { categoryCode: 'ZERO', rate: 0, active: true },
    { categoryCode: 'EXEMPT', rate: 0, active: true },
  ]
  if (!hasBrowserStorage()) return defaults
  try {
    const rates = JSON.parse(window.localStorage.getItem('pos_vat_rates') || 'null')
    return Array.isArray(rates) ? rates : defaults
  } catch {
    return defaults
  }
}

function calculateMockPricing(request) {
  if (!Array.isArray(request.lineItems) || request.lineItems.length === 0) return null
  const rates = configuredVatRates()
  const applyFee = request.applyCustomerFee
    && String(request.businessTransactionType || '').toUpperCase() === 'SALE'
  const storage = hasBrowserStorage() ? window.localStorage : null
  const feeRate = Number(storage?.getItem('pos_service_fee_rate') || 0.02)
  const lineItems = request.lineItems.map((item) => {
    const subtotal = roundMoney(
      Number(item.unitPrice) * Number(item.quantity)
      - Number(item.discountAmount || 0),
    )
    if (subtotal < 0) throw new Error('Discount cannot exceed the line item subtotal.')
    const rate = item.vatExempt
      ? 0
      : rates.find((configured) => configured.categoryCode === item.vatCategory && configured.active)?.rate
    if (rate === undefined) throw new Error(`No active VAT rate is configured for ${item.vatCategory || 'this item'}.`)
    const vatRate = Number(rate)
    const vatAmount = item.vatExempt || vatRate === 0
      ? 0
      : roundMoney(request.pricesIncludeVat
        ? subtotal * vatRate / (1 + vatRate)
        : subtotal * vatRate)
    const grossAmount = roundMoney(request.pricesIncludeVat ? subtotal - vatAmount : subtotal)
    const serviceFeeAmount = applyFee ? roundMoney(grossAmount * feeRate) : 0
    return {
      ...item,
      lineGrossAmount: grossAmount,
      lineVatAmount: vatAmount,
      lineServiceFeeAmount: serviceFeeAmount,
      lineNetAmount: roundMoney(grossAmount + vatAmount + serviceFeeAmount),
      vatRate,
    }
  })
  return lineItems.reduce((totals, item) => ({
    lineItems,
    grossAmount: roundMoney(totals.grossAmount + item.lineGrossAmount),
    totalVat: roundMoney(totals.totalVat + item.lineVatAmount),
    serviceFeeAmount: roundMoney(totals.serviceFeeAmount + item.lineServiceFeeAmount),
    netAmount: roundMoney(totals.netAmount + item.lineNetAmount),
  }), { lineItems, grossAmount: 0, totalVat: 0, serviceFeeAmount: 0, netAmount: 0 })
}

function processMockExpiry(transaction, now = Date.now()) {
  const expiry = transaction.preauthExpiresAt ? new Date(transaction.preauthExpiresAt).getTime() : NaN
  const status = String(transaction.status || '').toUpperCase()
  if (!Number.isFinite(expiry)
      || expiry > now
      || !['AUTHORIZED', 'PARTIALLY_CAPTURED'].includes(status)
      || transaction.manualCaptureOccurred) {
    return transaction
  }

  const holdAmount = Number(transaction.preauthHoldAmount || 0)
  const previouslyCaptured = Number(transaction.totalAmountPaid || 0)
  const autoCaptureAmount = previouslyCaptured === 0
    ? Math.min(Number(transaction.autoCaptureAmount || 0), holdAmount)
    : 0
  const cumulativeAmount = roundMoney(previouslyCaptured + autoCaptureAmount)
  const releasedAmount = Math.max(0, roundMoney(holdAmount - cumulativeAmount))
  const updated = { ...transaction, preauthExpiredAt: new Date(now).toISOString() }
  if (autoCaptureAmount > 0) {
    applyCapturedAmount(updated, cumulativeAmount)
    updated.totalAmountPaid = cumulativeAmount
    updated.refundableAmount = cumulativeAmount
    updated.captures = [
      ...(updated.captures || []),
      {
        operationType: 'AUTO_EXPIRY',
        idempotencyKey: `auto-expiry:${updated.transactionId}`,
        amount: autoCaptureAmount,
        cumulativeAmount,
        providerReference: `SIM-CAPTURE-${updated.transactionId}`,
        providerStatus: 'SIMULATED_APPROVED',
        createdAt: new Date(now).toISOString(),
      },
    ]
  }
  updated.status = cumulativeAmount > 0 ? 'CAPTURED' : 'EXPIRED'
  if (cumulativeAmount > 0) {
    updated.transactionType = updated.businessTransactionType || 'PURCHASE'
    updated.capturedAt = updated.capturedAt || new Date(now).toISOString()
    updated.settledAt = new Date(now).toISOString()
  }
  if (releasedAmount > 0) {
    updated.preauthReleaseReference = `SIM-RELEASE-${updated.transactionId}`
    updated.preauthReleaseStatus = 'SIMULATED_APPROVED'
  }
  return updated
}

function applyCapturedAmount(transaction, capturedAmount) {
  const originalAmount = Number(transaction.netAmount || transaction.preauthHoldAmount || 0)
  const ratio = originalAmount > 0 ? capturedAmount / originalAmount : 0
  transaction.grossAmount = roundMoney(Number(transaction.grossAmount || 0) * ratio)
  transaction.totalVat = roundMoney(Number(transaction.totalVat ?? transaction.vatAmount ?? 0) * ratio)
  transaction.vatAmount = transaction.totalVat
  transaction.serviceFeeAmount = roundMoney(Number(transaction.serviceFeeAmount || 0) * ratio)
  transaction.netAmount = roundMoney(capturedAmount)
  transaction.lineItems = (transaction.lineItems || []).map((item) => ({
    ...item,
    lineGrossAmount: roundMoney(Number(item.lineGrossAmount || 0) * ratio),
    lineVatAmount: roundMoney(Number(item.lineVatAmount || 0) * ratio),
    lineServiceFeeAmount: roundMoney(Number(item.lineServiceFeeAmount || 0) * ratio),
    lineNetAmount: roundMoney(Number(item.lineNetAmount || 0) * ratio),
  }))
}

function updateMockTransaction(transaction) {
  const transactions = readMockTransactions()
  const index = transactions.findIndex((item) => item.transactionId === transaction.transactionId)
  if (index < 0) throw new Error(`Transaction ${transaction.transactionId} was not found in fixture storage.`)
  transactions[index] = transaction
  writeMockTransactions(transactions)
  return transaction
}

function newMockId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function captureMockTransaction(transactionId, request) {
  const transaction = getMockTransaction(transactionId)
  if (!transaction) throw new Error(`Transaction ${transactionId} was not found in fixture storage.`)
  const amount = roundMoney(Number(request.captureAmount))
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Capture amount must be greater than zero.')

  const key = String(request.idempotencyKey || '').trim()
  if (!key) throw new Error('Capture idempotency key is required.')
  const priorCapture = (transaction.captures || []).find((capture) => capture.idempotencyKey === key)
  if (priorCapture) {
    if (Number(priorCapture.amount) !== amount) throw new Error('Capture idempotency key was already used for a different amount.')
    return transaction
  }
  const status = String(transaction.status || '').toUpperCase()
  if (!['AUTHORIZED', 'PARTIALLY_CAPTURED'].includes(status)
      || !transaction.preauthHoldAmount
      || transaction.manualCaptureOccurred) {
    throw new Error('Transaction is not eligible for another manual capture.')
  }
  const holdAmount = Number(transaction.preauthHoldAmount)
  const remainingHold = roundMoney(holdAmount - Number(transaction.totalAmountPaid || 0))
  if (amount > remainingHold) throw new Error('Capture amount exceeds the remaining authorization hold.')

  const capturedAmount = roundMoney(Number(transaction.totalAmountPaid || 0) + amount)
  const updated = {
    ...transaction,
    captures: [...(transaction.captures || []), {
      operationType: 'MANUAL',
      idempotencyKey: key,
      amount,
      cumulativeAmount: capturedAmount,
      providerReference: `SIM-CAPTURE-${newMockId('REF')}`,
      providerStatus: 'SIMULATED_APPROVED',
      createdAt: new Date().toISOString(),
    }],
    manualCaptureOccurred: true,
    totalAmountPaid: capturedAmount,
    refundableAmount: capturedAmount,
    capturedAt: transaction.capturedAt || new Date().toISOString(),
    preauthReleaseReference: amount < remainingHold ? `SIM-RELEASE-${newMockId('REF')}` : null,
    preauthReleaseStatus: amount < remainingHold ? 'SIMULATED_APPROVED' : null,
  }
  applyCapturedAmount(updated, capturedAmount)
  updated.status = capturedAmount === holdAmount ? 'CAPTURED' : 'PARTIALLY_CAPTURED'
  updated.transactionType = updated.businessTransactionType || 'PURCHASE'
  updated.settledAt = new Date().toISOString()
  let remainingCapture = capturedAmount
  updated.paymentTenders = (updated.paymentTenders || []).map((tender) => {
    const applied = Math.min(remainingCapture, Number(tender.amountTendered || 0))
    remainingCapture = roundMoney(remainingCapture - applied)
    return {
      ...tender,
      amountApplied: applied,
      status: applied === Number(tender.amountTendered || 0) ? 'CAPTURED' : 'AUTHORIZED',
    }
  })
  return updateMockTransaction(updated)
}

export function cancelMockPreAuth(transactionId, request) {
  const transaction = getMockTransaction(transactionId)
  if (!transaction) throw new Error(`Transaction ${transactionId} was not found in fixture storage.`)
  if (transaction.preauthCancellationKey === request.idempotencyKey
      && String(transaction.status).toUpperCase() === 'CANCELLED') return transaction
  if (String(transaction.status).toUpperCase() !== 'AUTHORIZED'
      || Number(transaction.totalAmountPaid || 0) > 0) {
    throw new Error('Only an uncaptured authorization can be cancelled.')
  }
  return updateMockTransaction({
    ...transaction,
    status: 'CANCELLED',
    preauthCancellationKey: request.idempotencyKey,
    preauthReleaseReference: `SIM-VOID-${transactionId}`,
    preauthReleaseStatus: 'SIMULATED_APPROVED',
    cancellationReason: request.reason || null,
    cancelledAt: new Date().toISOString(),
  })
}

export function refundMockTransaction(transactionId, request) {
  const original = getMockTransaction(transactionId)
  if (!original) throw new Error(`Transaction ${transactionId} was not found in fixture storage.`)
  const businessType = String(original.businessTransactionType || original.transactionType || '').toUpperCase()
  if (businessType !== 'SALE') throw new Error('Refunds are only available for Sale transactions.')
  const key = String(request.idempotencyKey || '').trim()
  if (!key) throw new Error('Refund idempotency key is required.')
  const amount = roundMoney(Number(request.refundAmount))
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Refund amount must be greater than zero.')

  const priorRequest = readMockTransactions().find((item) => item.idempotencyKey === key)
  if (priorRequest) {
    if (priorRequest.transactionType === 'REFUND'
        && priorRequest.parentTransactionId === transactionId
        && Number(priorRequest.netAmount) === amount) return priorRequest
    throw new Error('Idempotency key was already used for a different transaction.')
  }
  const status = String(original.status || '').toUpperCase()
  if (!['COMPLETED', 'SETTLED', 'CAPTURED', 'PARTIALLY_CAPTURED', 'PARTIALLY_REFUNDED'].includes(status)) {
    throw new Error('Only a captured transaction can be refunded.')
  }
  const createdAt = new Date(original.createdAt).getTime()
  if (Number.isFinite(createdAt) && Date.now() - createdAt > 30 * 24 * 60 * 60 * 1000) {
    throw new Error('Refund window has expired.')
  }
  const capturedAmount = Math.min(
    Number(original.totalAmountPaid || 0),
    Number(original.refundableAmount ?? original.totalAmountPaid ?? 0),
  )
  const remainingRefundable = roundMoney(capturedAmount - Number(original.refundedAmount || 0))
  if (amount > remainingRefundable) throw new Error('Refund amount exceeds the remaining captured balance.')

  const originalNet = Number(original.netAmount || capturedAmount)
  const ratio = originalNet > 0 ? amount / originalNet : 0
  const refundId = newMockId('TXN-DEMO-REFUND')
  const refund = {
    transactionId: refundId,
    parentTransactionId: transactionId,
    transactionType: 'REFUND',
    businessTransactionType: original.businessTransactionType || original.transactionType,
    status: 'REFUNDED',
    idempotencyKey: key,
    befaPaymentId: `REFUND-${refundId}`,
    bankTransactionId: newMockId('BANK-REFUND'),
    cashRegisterId: original.cashRegisterId,
    cashierId: request.cashierId || original.cashierId,
    customerName: original.customerName,
    customerTin: original.customerTin,
    currencyCode: original.currencyCode || 'ETB',
    grossAmount: roundMoney(Number(original.grossAmount || 0) * ratio),
    totalVat: roundMoney(Number(original.totalVat ?? original.vatAmount ?? 0) * ratio),
    vatAmount: roundMoney(Number(original.totalVat ?? original.vatAmount ?? 0) * ratio),
    serviceFeeAmount: roundMoney(Number(original.serviceFeeAmount || 0) * ratio),
    netAmount: amount,
    totalAmountPaid: 0,
    refundableAmount: 0,
    refundedAmount: amount,
    cancellationReason: request.reason || null,
    createdAt: new Date().toISOString(),
    settledAt: new Date().toISOString(),
    lineItems: [],
    paymentTenders: [],
  }
  const refundedAmount = roundMoney(Number(original.refundedAmount || 0) + amount)
  const updatedOriginal = {
    ...original,
    refundedAmount,
    status: refundedAmount >= capturedAmount ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
  }
  updateMockTransaction(updatedOriginal)
  return saveMockTransaction(refund)
}

export function reverseMockTransaction(transactionId, request) {
  const original = getMockTransaction(transactionId)
  if (!original) throw new Error(`Transaction ${transactionId} was not found in fixture storage.`)
  const key = String(request.idempotencyKey || '').trim()
  if (!key) throw new Error('Reversal idempotency key is required.')
  const priorRequest = readMockTransactions().find((item) => item.idempotencyKey === key)
  if (priorRequest?.transactionType === 'REVERSAL' && priorRequest.parentTransactionId === transactionId) {
    return priorRequest
  }
  if (String(original.status).toUpperCase() !== 'PENDING'
      || original.settledAt
      || original.capturedAt) {
    throw new Error('Technical reversal is only available for an unsettled pending transaction.')
  }
  const reversalId = newMockId('TXN-DEMO-REVERSAL')
  const reversal = {
    transactionId: reversalId,
    parentTransactionId: transactionId,
    transactionType: 'REVERSAL',
    businessTransactionType: original.businessTransactionType || original.transactionType,
    status: 'REVERSED',
    idempotencyKey: key,
    befaPaymentId: `REVERSAL-${reversalId}`,
    bankTransactionId: newMockId('BANK-REVERSAL'),
    cashRegisterId: original.cashRegisterId,
    cashierId: request.cashierId || original.cashierId,
    currencyCode: original.currencyCode || 'ETB',
    grossAmount: original.grossAmount,
    totalVat: original.totalVat ?? original.vatAmount,
    vatAmount: original.vatAmount ?? original.totalVat,
    serviceFeeAmount: original.serviceFeeAmount,
    netAmount: original.netAmount,
    totalAmountPaid: 0,
    createdAt: new Date().toISOString(),
    settledAt: new Date().toISOString(),
    cancellationReason: request.reason || null,
    lineItems: [],
    paymentTenders: [],
  }
  updateMockTransaction({ ...original, status: 'REVERSED' })
  return saveMockTransaction(reversal)
}

function hasBrowserStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function readMockTransactions() {
  if (hasBrowserStorage()) {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      const parsed = stored ? JSON.parse(stored) : []
      memoryTransactions = Array.isArray(parsed) ? parsed : []
    } catch {
      // Keep the UI usable when browser storage is disabled or full.
    }
  }
  const processed = memoryTransactions.map((transaction) => processMockExpiry(transaction))
  if (processed.some((transaction, index) => transaction !== memoryTransactions[index])) {
    writeMockTransactions(processed)
  }
  return [...processed].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

function writeMockTransactions(transactions) {
  memoryTransactions = transactions
  if (hasBrowserStorage()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions))
      window.dispatchEvent(new CustomEvent('pos-tax-vat:transactions-changed'))
    } catch {
      // The current session continues to work if storage is unavailable.
    }
  }
}

export function saveMockTransaction(transaction) {
  const current = readMockTransactions()
  const idempotencyKey = transaction.idempotencyKey
  const previous = idempotencyKey && current.find((item) => item.idempotencyKey === idempotencyKey)
  if (previous) return previous

  const next = [transaction, ...current]
  writeMockTransactions(next)
  return transaction
}

export function getMockTransaction(transactionId) {
  return readMockTransactions().find((item) => item.transactionId === transactionId) || null
}

export function filterMockTransactions(filters = {}) {
  const query = String(filters.query || filters.fullText || '').trim().toLowerCase()
  const from = filters.dateFrom ? new Date(filters.dateFrom).getTime() : null
  const to = filters.dateTo ? new Date(filters.dateTo).getTime() : null

  return readMockTransactions().filter((transaction) => {
    const created = new Date(transaction.createdAt).getTime()
    const values = [transaction.transactionId, transaction.customerName, transaction.customerTin, transaction.cashRegisterId, transaction.cashierId]
    if (query && !values.some((value) => String(value || '').toLowerCase().includes(query))) return false
    if (filters.status && String(transaction.status).toUpperCase() !== String(filters.status).toUpperCase()) return false
    if (filters.transactionType && String(transaction.transactionType).toUpperCase() !== String(filters.transactionType).toUpperCase()) return false
    if (filters.customerName && !String(transaction.customerName || '').toLowerCase().includes(String(filters.customerName).toLowerCase())) return false
    if (filters.befaPaymentId && !String(transaction.befaPaymentId || '').toLowerCase().includes(String(filters.befaPaymentId).toLowerCase())) return false
    if (filters.bankTransactionId && !String(transaction.bankTransactionId || '').toLowerCase().includes(String(filters.bankTransactionId).toLowerCase())) return false
    if (filters.customerTin && !String(transaction.customerTin || '').includes(String(filters.customerTin))) return false
    if (filters.cashRegisterId && !String(transaction.cashRegisterId || '').includes(String(filters.cashRegisterId))) return false
    if (filters.cashierId && !String(transaction.cashierId || '').includes(String(filters.cashierId))) return false
    if (Number.isFinite(from) && created < from) return false
    if (Number.isFinite(to) && created > to) return false
    if (filters.minAmount !== undefined && Number(transaction.netAmount || 0) < Number(filters.minAmount)) return false
    if (filters.maxAmount !== undefined && Number(transaction.netAmount || 0) > Number(filters.maxAmount)) return false
    if (filters.paymentMethod && !(transaction.paymentTenders || []).some((tender) => String(tender.paymentMethod).toUpperCase() === String(filters.paymentMethod).toUpperCase())) return false
    return true
  })
}

export function paginateMockTransactions(items, page = 0, size = 20) {
  const safeSize = Math.max(1, Number(size) || 20)
  const totalElements = items.length
  const totalPages = Math.ceil(totalElements / safeSize)
  const safePage = Math.min(Math.max(0, Number(page) || 0), Math.max(0, totalPages - 1))
  return {
    content: items.slice(safePage * safeSize, (safePage + 1) * safeSize),
    page: safePage,
    size: safeSize,
    totalElements,
    totalPages,
    first: safePage === 0,
    last: totalPages === 0 || safePage >= totalPages - 1,
  }
}

export function buildMockTransaction(request, bankResponse) {
  const existing = request.idempotencyKey && readMockTransactions()
    .find((item) => item.idempotencyKey === request.idempotencyKey)
  if (existing) return existing

  const now = new Date().toISOString()
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const pricing = request.fixturePricing || calculateMockPricing(request)
  const currencyCode = request.currencyCode || bankResponse.currencyCode || 'ETB'
  const isAuthorized = String(bankResponse.status || '').toUpperCase() === 'AUTHORIZED'
  const transaction = {
    ...bankResponse,
    transactionId: `TXN-DEMO-${suffix}`,
    transactionType: bankResponse.transactionType || 'PURCHASE',
    businessTransactionType: request.businessTransactionType || bankResponse.businessTransactionType || 'PURCHASE',
    createdAt: now,
    idempotencyKey: request.idempotencyKey || bankResponse.idempotencyKey,
    customerName: request.customerName || bankResponse.customerName || 'Guest',
    customerTin: request.customerTin || bankResponse.customerTin || null,
    befaPaymentId: request.befaPaymentId,
    cashRegisterId: request.cashRegisterId,
    cashierId: request.cashierId,
    currencyCode,
    preauthHoldAmount: request.preauthHoldAmount ?? bankResponse.preauthHoldAmount,
    autoCaptureAmount: request.autoCaptureAmount ?? bankResponse.autoCaptureAmount ?? 0,
    preauthExpiresAt: request.expiresInHours
      ? new Date(Date.now() + Number(request.expiresInHours) * 60 * 60 * 1000).toISOString()
      : bankResponse.preauthExpiresAt,
    manualCaptureOccurred: isAuthorized ? false : bankResponse.manualCaptureOccurred,
    grossAmount: pricing?.grossAmount ?? bankResponse.grossAmount,
    netAmount: pricing?.netAmount ?? bankResponse.netAmount,
    totalAmountPaid: isAuthorized
      ? 0
      : pricing?.netAmount ?? bankResponse.totalAmountPaid,
    totalVat: pricing?.totalVat ?? (bankResponse.totalVat === undefined && request.totalVat === undefined
      ? null
      : Number(bankResponse.totalVat ?? request.totalVat)),
    serviceFeeAmount: pricing?.serviceFeeAmount ?? bankResponse.serviceFeeAmount ?? 0,
    paymentTenders: (request.paymentTenders || []).map((tender) => ({ ...tender })),
    lineItems: pricing?.lineItems || (request.lineItems || []).map((item) => ({ ...item })),
  }
  return saveMockTransaction(transaction)
}

export function summarizeMockTransactions(transactions, dateFrom, dateTo) {
  const from = dateFrom ? new Date(dateFrom).getTime() : -Infinity
  const to = dateTo ? new Date(dateTo).getTime() : Infinity
  return transactions.filter((transaction) => {
    const time = new Date(transaction.createdAt).getTime()
    return time >= from && time <= to
  })
}
