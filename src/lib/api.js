import axios from 'axios'
import { ApiError, reportApiError } from './apiError'
import {
  buildMockTransaction,
  cancelMockPreAuth,
  captureMockTransaction,
  filterMockTransactions,
  getMockTransaction,
  paginateMockTransactions,
  readMockTransactions,
  refundMockTransaction,
  reverseMockTransaction,
  summarizeMockTransactions,
} from './mockStore'

const API_BASE_URL = import.meta.env.VITE_POS_API_BASE_URL || '/api/v1/pos'
const POS_DATA_MODE = import.meta.env.VITE_POS_DATA_MODE || 'http'

// Keep these paths aligned with the existing POS and bank controller routes.
// Only the base URL or these values should change when the backend contract moves.
export const API_ENDPOINTS = Object.freeze({
  dashboard: Object.freeze({ summary: '/dashboard/summary' }),
  transactions: Object.freeze({
    purchase: '/transactions/purchase',
    preAuth: '/transactions/preauth',
    byId: (id) => `/transactions/${encodeURIComponent(id)}`,
    all: '/transactions',
    pending: '/transactions/pending',
    capture: (id) => `/transactions/${encodeURIComponent(id)}/capture`,
    cancel: (id) => `/transactions/${encodeURIComponent(id)}/cancel`,
    refund: (id) => `/transactions/${encodeURIComponent(id)}/refund`,
    reverse: (id) => `/transactions/${encodeURIComponent(id)}/reverse`,
  }),
  search: Object.freeze({
    transactions: '/search/transactions',
    fullText: '/search/fulltext',
    customerName: '/search/customer-name',
    customerTin: '/search/customer-tin',
    amountRange: '/search/amount-range',
    paymentMethod: '/search/payment-method',
    recent: '/search/recent',
    refunds: (id) => `/search/refunds/${encodeURIComponent(id)}`,
    reversals: (id) => `/search/reversals/${encodeURIComponent(id)}`,
    children: (id) => `/search/children/${encodeURIComponent(id)}`,
  }),
  reports: Object.freeze({
    revenue: '/reports/revenue', vat: '/reports/vat', serviceFees: '/reports/service-fees',
    financialAudit: '/reports/financial-audit',
    fiscalSubmissions: '/reports/fiscal-submissions',
    fiscalSubmission: (id) => `/reports/fiscal-submissions/${encodeURIComponent(id)}`,
    refunds: '/reports/refunds', cashierPerformance: '/reports/cashier-performance',
    paymentMethodBreakdown: '/reports/payment-method-breakdown', dailySummary: '/reports/daily-summary',
    monthlySummary: '/reports/monthly-summary', transactionStats: '/reports/transaction-stats',
    hourlyVolume: '/reports/hourly-volume', averageTransactionValue: '/reports/average-transaction-value',
    grossVsNet: '/reports/gross-vs-net', refundRate: '/reports/refund-rate',
    topCashiers: '/reports/top-cashiers', topRegisters: '/reports/top-registers',
  }),
  settings: Object.freeze({ currency: '/settings/currency', pricing: '/settings/pricing' }),
  items: Object.freeze({ report: '/items/report' }),
  bankPayments: Object.freeze({
    base: '/api/v1/pos/bank-payments',
    terminalScenarios: '/api/v1/pos/bank-payments/terminal-scenarios',
    preview: '/preview',
    execute: '/execute',
    status: (befaPaymentId) => '/api/v1/pos/bank-payments/status/' + encodeURIComponent(befaPaymentId),
    lookup: (identifier) => `/api/v1/pos/bank-payments/lookup/${encodeURIComponent(identifier)}`,
    lookupAll: (identifier) => `/api/v1/pos/bank-payments/lookup/${encodeURIComponent(identifier)}/all`,
  }),
})

const PAYMENT_INTEGRATION_MODE = import.meta.env.VITE_PAYMENT_INTEGRATION_MODE || 'http'

// Fixture mode selects the backend's fixture-backed payment processor.
export const paymentIntegrationConfig = Object.freeze({
  mode: PAYMENT_INTEGRATION_MODE,
  endpoints: Object.freeze({
    liveBankPayment: import.meta.env.VITE_BANK_PAYMENT_URL || `${API_ENDPOINTS.bankPayments.base}${API_ENDPOINTS.bankPayments.execute}`,
  }),
  persistence: PAYMENT_INTEGRATION_MODE === 'fixtures' ? 'POS backend database' : 'Bank service',
})

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
})

const integrationClient = axios.create({
  baseURL: '/',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
})

for (const client of [api, integrationClient]) {
  client.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('jwt_token')
      if (token) config.headers.Authorization = `Bearer ${token}`
      return config
    },
    (error) => Promise.reject(error),
  )

  client.interceptors.response.use(
    (response) => response,
    (error) => {
      // Dispatch error to global error context for display
      // Show: 400 (bad requests), 500+ (server errors)
      // Don't show: 404 (not found - handled gracefully by UI)
      reportApiError(error)
      return Promise.reject(ApiError.from(error))
    },
  )
}

const isLocalPosDataMode = () => POS_DATA_MODE === 'fixtures'
const responseOf = (data) => ({ data, status: 200, headers: {}, config: {} })
const unwrapEnvelope = (data) => data && typeof data === 'object' && !Array.isArray(data)
  && Object.keys(data).length === 1 && Object.hasOwn(data, 'data') ? data.data : data
const rowsFrom = (data) => {
  const value = unwrapEnvelope(data)
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.content)) return value.content
  if (Array.isArray(value?.items)) return value.items
  if (Array.isArray(value?.transactions)) return value.transactions
  return []
}
async function pageResponse(request) {
  const response = await request
  const data = unwrapEnvelope(response.data)
  if (Array.isArray(data)) {
    response.data = { content: data, page: 0, size: data.length, totalElements: data.length, totalPages: data.length ? 1 : 0 }
  } else if (data && typeof data === 'object') {
    const content = rowsFrom(data)
    response.data = {
      ...data,
      content,
      totalElements: data.totalElements ?? data.totalCount ?? content.length,
      totalPages: data.totalPages ?? (content.length ? 1 : 0),
      page: data.page ?? data.number ?? 0,
    }
  }
  return response
}
async function listResponse(request) {
  const response = await request
  response.data = rowsFrom(response.data)
  return response
}
const pageOf = (items, params = {}) => paginateMockTransactions(items, params.page, params.size)

function rangeTransactions(dateFrom, dateTo) {
  return summarizeMockTransactions(readMockTransactions(), dateFrom, dateTo)
}

function settledTransactions(items) {
  return items.filter((item) => ['SETTLED', 'COMPLETED', 'SUCCESS'].includes(String(item.status).toUpperCase()))
}

function sum(items, key) {
  return items.reduce((total, item) => total + (Number(item[key]) || 0), 0)
}

function localRevenue(dateFrom, dateTo) {
  const settled = settledTransactions(rangeTransactions(dateFrom, dateTo))
  const daily = new Map()
  for (const transaction of settled) {
    const day = String(transaction.createdAt || '').slice(0, 10)
    const current = daily.get(day) || { date: day, totalRevenue: 0, totalVat: null }
    current.totalRevenue += Number(transaction.netAmount) || 0
    if (transaction.totalVat !== null && transaction.totalVat !== undefined) {
      current.totalVat = (current.totalVat || 0) + Number(transaction.totalVat || 0)
    }
    daily.set(day, current)
  }
  const vatByCategory = new Map()
  for (const transaction of settled) {
    for (const item of transaction.lineItems || []) {
      if (item.vatAmount === null || item.vatAmount === undefined) continue
      const category = item.vatCategory || (item.vatExempt ? 'EXEMPT' : 'STANDARD')
      const row = vatByCategory.get(category) || { vatCategory: category, vatAmount: 0 }
      row.vatAmount += Number(item.vatAmount) || 0
      vatByCategory.set(category, row)
    }
  }
  return {
    revenue: sum(settled, 'netAmount'),
    vatAmount: settled.length === 0
      ? 0
      : settled.some((transaction) => transaction.totalVat !== null && transaction.totalVat !== undefined)
        ? sum(settled, 'totalVat')
        : null,
    dailyBreakdown: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    vatBreakdown: [...vatByCategory.values()],
  }
}

function localPaymentMethods(dateFrom, dateTo) {
  const settled = settledTransactions(rangeTransactions(dateFrom, dateTo))
  const groups = new Map()
  for (const transaction of settled) {
    const tenders = transaction.paymentTenders?.length ? transaction.paymentTenders : [{ paymentMethod: transaction.paymentMethod, amountTendered: transaction.netAmount }]
    for (const tender of tenders) {
      const method = tender.paymentMethod || 'Unknown'
      const row = groups.get(method) || { paymentMethod: method, totalAmount: 0, transactionCount: 0 }
      row.totalAmount += Number(tender.amountTendered) || 0
      row.transactionCount += 1
      groups.set(method, row)
    }
  }
  const total = [...groups.values()].reduce((amount, row) => amount + row.totalAmount, 0)
  return [...groups.values()].map((row) => ({ ...row, percentage: total ? row.totalAmount / total * 100 : 0 }))
}

function localFinancialAudit(dateFrom, dateTo) {
  const eligibleStatuses = new Set(['SETTLED', 'COMPLETED', 'SUCCESS', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REVERSED'])
  const groups = new Map()
  const from = dateFrom ? new Date(dateFrom).getTime() : -Infinity
  const to = dateTo ? new Date(dateTo).getTime() : Infinity
  const transactions = readMockTransactions().filter((transaction) => {
    const effectiveDate = new Date(transaction.settledAt || transaction.createdAt).getTime()
    if (effectiveDate < from || effectiveDate > to) return false
    const type = String(transaction.transactionType || '').toUpperCase()
    const status = String(transaction.status || '').toUpperCase()
    if (['SALE', 'PURCHASE'].includes(type)) return eligibleStatuses.has(status)
    if (type === 'REFUND') return status === 'REFUNDED'
    if (type === 'REVERSAL') return status === 'REVERSED'
    return false
  })

  for (const transaction of transactions) {
    const type = String(transaction.transactionType).toUpperCase()
    const row = groups.get(type) || {
      transactionType: type,
      transactionCount: 0,
      grossAmount: 0,
      vatAmount: 0,
      serviceFeeAmount: 0,
      netAmount: 0,
      totalAmountPaid: 0,
    }
    const lineItems = transaction.lineItems || []
    const lineGross = lineItems.reduce((total, item) => (
      total + (Number(item.lineGrossAmount)
        || (Number(item.unitPrice) * (Number(item.quantity) || 0) - (Number(item.discountAmount) || 0)))
    ), 0)
    row.transactionCount += 1
    row.grossAmount += Number(transaction.grossAmount) || lineGross
    row.vatAmount += Number(transaction.vatAmount ?? transaction.totalVat) || 0
    row.serviceFeeAmount += Number(transaction.serviceFeeAmount) || 0
    row.netAmount += Number(transaction.netAmount) || 0
    row.totalAmountPaid += Number(transaction.totalAmountPaid) || 0
    groups.set(type, row)
  }

  return [...groups.values()]
}

function localFinancialAuditAnalysis(dateFrom, dateTo, groupedTransactions) {
  const from = dateFrom ? new Date(dateFrom).getTime() : -Infinity
  const to = dateTo ? new Date(dateTo).getTime() : Infinity
  const included = readMockTransactions().filter((transaction) => {
    const effectiveDate = new Date(transaction.settledAt || transaction.createdAt).getTime()
    if (effectiveDate < from || effectiveDate > to) return false
    const type = String(transaction.transactionType || '').toUpperCase()
    const status = String(transaction.status || '').toUpperCase()
    if (['SALE', 'PURCHASE'].includes(type)) {
      return ['SETTLED', 'COMPLETED', 'SUCCESS', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REVERSED'].includes(status)
    }
    return (type === 'REFUND' && status === 'REFUNDED') || (type === 'REVERSAL' && status === 'REVERSED')
  })
  const parents = new Map(readMockTransactions().map((transaction) => [transaction.transactionId, transaction]))
  const sumType = (type, field) => Number(groupedTransactions.find((row) => row.transactionType === type)?.[field]) || 0
  const sumAdjustments = (parentType, field) => included.reduce((total, transaction) => {
    const type = String(transaction.transactionType || '').toUpperCase()
    if (type !== 'REFUND' && type !== 'REVERSAL') return total
    const parent = parents.get(transaction.parentTransactionId)
    if (String(parent?.transactionType || '').toUpperCase() !== parentType) return total
    const value = field === 'vatAmount'
      ? transaction.vatAmount ?? transaction.totalVat
      : transaction[field]
    return total + (Number(value) || 0)
  }, 0)
  const salesDue = sumType('SALE', 'netAmount')
  const salesPaid = sumType('SALE', 'totalAmountPaid')
  const purchasesDue = sumType('PURCHASE', 'netAmount')
  const purchasesPaid = sumType('PURCHASE', 'totalAmountPaid')

  return {
    netSalesAfterAdjustments: sumType('SALE', 'netAmount') - sumAdjustments('SALE', 'netAmount'),
    netPurchasesAfterAdjustments: sumType('PURCHASE', 'netAmount') - sumAdjustments('PURCHASE', 'netAmount'),
    salesVatRecordedAfterAdjustments: sumType('SALE', 'vatAmount') - sumAdjustments('SALE', 'vatAmount'),
    purchasesVatRecordedAfterAdjustments: sumType('PURCHASE', 'vatAmount') - sumAdjustments('PURCHASE', 'vatAmount'),
    serviceFeesAfterReversals: sumType('SALE', 'serviceFeeAmount') + sumType('PURCHASE', 'serviceFeeAmount')
      - sumAdjustments('SALE', 'serviceFeeAmount') - sumAdjustments('PURCHASE', 'serviceFeeAmount'),
    refundAmount: sumType('REFUND', 'netAmount'),
    reversalAmount: sumType('REVERSAL', 'netAmount'),
    salesAmountDue: salesDue,
    salesAmountPaid: salesPaid,
    salesPaymentVariance: salesPaid - salesDue,
    purchasesAmountDue: purchasesDue,
    purchasesAmountPaid: purchasesPaid,
    purchasesPaymentVariance: purchasesPaid - purchasesDue,
  }
}

function localFinancialAuditBreakdowns(dateFrom, dateTo) {
  const from = dateFrom ? new Date(dateFrom).getTime() : -Infinity
  const to = dateTo ? new Date(dateTo).getTime() : Infinity
  const allTransactions = readMockTransactions()
  const rows = allTransactions.filter((transaction) => {
    const effectiveDate = new Date(transaction.settledAt || transaction.createdAt).getTime()
    if (effectiveDate < from || effectiveDate > to) return false
    const type = String(transaction.transactionType || '').toUpperCase()
    const status = String(transaction.status || '').toUpperCase()
    if (['SALE', 'PURCHASE'].includes(type)) {
      return ['SETTLED', 'COMPLETED', 'SUCCESS', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REVERSED'].includes(status)
    }
    return (type === 'REFUND' && status === 'REFUNDED') || (type === 'REVERSAL' && status === 'REVERSED')
  })
  const daily = new Map()
  const methods = new Map()
  const items = new Map()
  const operators = new Map()
  const outstanding = new Map()

  for (const transaction of rows) {
    const type = String(transaction.transactionType || '').toUpperCase()
    const effectiveDate = transaction.settledAt || transaction.createdAt
    const day = String(effectiveDate || '').slice(0, 10)
    const dailyKey = `${day}:${type}`
    const dailyRow = daily.get(dailyKey) || {
      date: day,
      transactionType: type,
      transactionCount: 0,
      netAmount: 0,
      vatAmount: 0,
    }
    dailyRow.transactionCount += 1
    dailyRow.netAmount += Number(transaction.netAmount) || 0
    dailyRow.vatAmount += Number(transaction.vatAmount ?? transaction.totalVat) || 0
    daily.set(dailyKey, dailyRow)

    if (type === 'SALE' || type === 'PURCHASE') {
      for (const tender of transaction.paymentTenders || []) {
        const method = String(tender.paymentMethod || 'UNKNOWN')
        const methodRow = methods.get(method) || { paymentMethod: method, tenderCount: 0, amountApplied: 0 }
        methodRow.tenderCount += 1
        methodRow.amountApplied += Number(tender.amountApplied ?? tender.amountTendered) || 0
        methods.set(method, methodRow)
      }

      for (const line of transaction.lineItems || []) {
        const itemCode = String(line.itemCode || '')
        if (!itemCode) continue
        const item = items.get(itemCode) || {
          itemCode,
          itemName: line.itemName || itemCode,
          saleQuantity: 0,
          purchaseQuantity: 0,
          saleNetAmount: 0,
          purchaseNetAmount: 0,
        }
        const quantity = Number(line.quantity) || 0
        const lineNetAmount = Number(line.lineNetAmount) || 0
        if (type === 'SALE') {
          item.saleQuantity += quantity
          item.saleNetAmount += lineNetAmount
        } else {
          item.purchaseQuantity += quantity
          item.purchaseNetAmount += lineNetAmount
        }
        items.set(itemCode, item)
      }

      const cashierId = String(transaction.cashierId || 'Unassigned')
      const cashRegisterId = String(transaction.cashRegisterId || 'Unassigned')
      const operatorKey = `${cashierId}:${cashRegisterId}:${type}`
      const operator = operators.get(operatorKey) || {
        cashierId,
        cashRegisterId,
        transactionType: type,
        transactionCount: 0,
        netAmount: 0,
      }
      operator.transactionCount += 1
      operator.netAmount += Number(transaction.netAmount) || 0
      operators.set(operatorKey, operator)
    }
  }

  for (const transaction of allTransactions) {
    const effectiveDate = new Date(transaction.createdAt).getTime()
    if (effectiveDate < from || effectiveDate > to) continue
    const status = String(transaction.status || '').toUpperCase()
    if (!['PENDING', 'AUTHORIZED', 'CAPTURED', 'PARTIALLY_CAPTURED', 'REFUND_PENDING', 'REVERSAL_PENDING'].includes(status)) continue
    const type = String(transaction.transactionType || '').toUpperCase()
    const key = `${type}:${status}`
    const row = outstanding.get(key) || {
      transactionType: type,
      status,
      transactionCount: 0,
      netAmount: 0,
      amountPaid: 0,
    }
    row.transactionCount += 1
    row.netAmount += Number(transaction.netAmount) || 0
    row.amountPaid += Number(transaction.totalAmountPaid) || 0
    outstanding.set(key, row)
  }

  return {
    dailyActivity: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    paymentMethods: [...methods.values()],
    itemActivity: [...items.values()],
    operatorActivity: [...operators.values()],
    outstandingActivity: [...outstanding.values()],
  }
}

function localCashierPerformance(dateFrom, dateTo) {
  const groups = new Map()
  for (const transaction of settledTransactions(rangeTransactions(dateFrom, dateTo))) {
    const cashierId = transaction.cashierId || 'Unassigned'
    const row = groups.get(cashierId) || { cashierId, totalRevenue: 0, transactionCount: 0 }
    row.totalRevenue += Number(transaction.netAmount) || 0
    row.transactionCount += 1
    groups.set(cashierId, row)
  }
  return [...groups.values()].sort((a, b) => b.totalRevenue - a.totalRevenue)
}

function localReportResponse(data) {
  return Promise.resolve(responseOf(data))
}

function relatedMockTransactions(parentId, type) {
  return readMockTransactions().filter((item) => {
    const matchesParent = item.parentTransactionId === parentId || item.parentId === parentId
    return matchesParent && (!type || String(item.transactionType).toUpperCase() === type)
  })
}

function buildLocalItemReport() {
  const items = new Map()
  const successfulStatuses = new Set(['SETTLED', 'COMPLETED', 'SUCCESS', 'PAID'])
  const transactions = readMockTransactions().filter((transaction) => (
    ['SALE', 'PURCHASE'].includes(String(transaction.transactionType).toUpperCase())
      && successfulStatuses.has(String(transaction.status).toUpperCase())
  ))

  transactions.forEach((transaction) => {
    const type = String(transaction.transactionType).toUpperCase()
    const lineItems = transaction.lineItems || []
    lineItems.forEach((lineItem) => {
      const itemCode = String(lineItem.itemCode || '').trim()
      if (!itemCode) return
      const item = items.get(itemCode) || {
        itemCode,
        itemName: lineItem.itemName || itemCode,
        currentQuantityOnHand: 0,
        saleQuantity: 0,
        purchaseQuantity: 0,
        saleAmount: 0,
        purchaseAmount: 0,
        saleTransactionCount: new Set(),
        purchaseTransactionCount: new Set(),
      }
      const quantity = Number(lineItem.quantity) || 0
      const amount = lineItem.lineNetAmount === null || lineItem.lineNetAmount === undefined
        ? Number(lineItem.unitPrice) * quantity - (Number(lineItem.discountAmount) || 0)
        : Number(lineItem.lineNetAmount) || 0
      const countKey = transaction.transactionId || transaction.createdAt

      if (type === 'SALE') {
        item.saleQuantity += quantity
        item.saleAmount += amount
        item.currentQuantityOnHand -= quantity
        item.saleTransactionCount.add(countKey)
      } else {
        item.purchaseQuantity += quantity
        item.purchaseAmount += amount
        item.currentQuantityOnHand += quantity
        item.purchaseTransactionCount.add(countKey)
      }
      items.set(itemCode, item)
    })
  })

  return [...items.values()]
    .map((item) => ({
      ...item,
      saleTransactionCount: item.saleTransactionCount.size,
      purchaseTransactionCount: item.purchaseTransactionCount.size,
    }))
    .sort((left, right) => left.itemName.localeCompare(right.itemName))
}

// Transaction API
export const transactionAPI = {
  create: (data) => isLocalPosDataMode()
    ? Promise.resolve(responseOf(buildMockTransaction(data, {
      status: 'COMPLETED',
      transactionType: 'PURCHASE',
      grossAmount: data.lineItems.reduce((total, item) => total + (Number(item.unitPrice) * Number(item.quantity) - (Number(item.discountAmount) || 0)), 0),
      netAmount: data.paymentTenders.reduce((total, tender) => total + (Number(tender.amountApplied) || 0), 0),
      totalAmountPaid: data.paymentTenders.reduce((total, tender) => total + (Number(tender.amountApplied) || 0), 0),
    })))
    : api.post(API_ENDPOINTS.transactions.purchase, data),
  preAuth: (data) => isLocalPosDataMode()
    ? Promise.resolve(responseOf(buildMockTransaction(data, {
      status: 'AUTHORIZED',
      transactionType: 'PRE_AUTH',
      grossAmount: data.preauthHoldAmount,
      netAmount: data.preauthHoldAmount,
      preauthHoldAmount: data.preauthHoldAmount,
      totalAmountPaid: 0,
    })))
    : api.post(API_ENDPOINTS.transactions.preAuth, data),
  capture: async (transactionId, data) => {
    if (getMockTransaction(transactionId)) {
      return responseOf(captureMockTransaction(transactionId, data))
    }
    if (isLocalPosDataMode()) {
      throw new ApiError({ message: 'Transaction was not found in fixture storage.', status: 404 })
    }
    return api.post(API_ENDPOINTS.transactions.capture(transactionId), data)
  },
  cancel: async (transactionId, data) => {
    if (getMockTransaction(transactionId)) {
      return responseOf(cancelMockPreAuth(transactionId, data))
    }
    if (isLocalPosDataMode()) {
      throw new ApiError({ message: 'Transaction was not found in fixture storage.', status: 404 })
    }
    return api.post(API_ENDPOINTS.transactions.cancel(transactionId), data)
  },
  refund: async (transactionId, data) => {
    if (getMockTransaction(transactionId)) {
      return responseOf(refundMockTransaction(transactionId, data))
    }
    if (isLocalPosDataMode()) {
      throw new ApiError({ message: 'Transaction was not found in fixture storage.', status: 404 })
    }
    return api.post(API_ENDPOINTS.transactions.refund(transactionId), data)
  },
  reverse: async (transactionId, data) => {
    if (getMockTransaction(transactionId)) {
      return responseOf(reverseMockTransaction(transactionId, data))
    }
    if (isLocalPosDataMode()) {
      throw new ApiError({ message: 'Transaction was not found in fixture storage.', status: 404 })
    }
    return api.post(API_ENDPOINTS.transactions.reverse(transactionId), data)
  },
  getById: (transactionId) => {
    const transaction = getMockTransaction(transactionId)
    if (transaction) return Promise.resolve(responseOf(transaction))
    return api.get(API_ENDPOINTS.transactions.byId(transactionId))
  },
  getAll: (params = {}) => isLocalPosDataMode()
    ? Promise.resolve(responseOf(pageOf(filterMockTransactions(params), params)))
    : pageResponse(api.get(API_ENDPOINTS.transactions.all, { params })),
  getPending: (params = {}) => isLocalPosDataMode()
    ? Promise.resolve(responseOf(pageOf(filterMockTransactions({ ...params, status: 'PENDING' }), params)))
    : pageResponse(api.get(API_ENDPOINTS.transactions.pending, { params })),
}

export const itemReportsAPI = {
  get: () => isLocalPosDataMode()
    ? Promise.resolve(responseOf(buildLocalItemReport()))
    : listResponse(api.get(API_ENDPOINTS.items.report)),
}

// Search API
export const searchAPI = {
  transactions: (params = {}) => isLocalPosDataMode()
    ? Promise.resolve(responseOf(pageOf(filterMockTransactions(params), params)))
    : pageResponse(api.get(API_ENDPOINTS.search.transactions, { params })),
  fullText: (query, page = 0, size = 20, filters = {}) => isLocalPosDataMode()
    ? Promise.resolve(responseOf(pageOf(filterMockTransactions({ query, ...filters }), { page, size })))
    : pageResponse(api.get(API_ENDPOINTS.search.fullText, { params: { query, page, size, ...filters } })),
  byCustomerName: (name, page = 0, size = 20) => isLocalPosDataMode()
    ? Promise.resolve(responseOf(pageOf(filterMockTransactions({ customerName: name }), { page, size })))
    : pageResponse(api.get(API_ENDPOINTS.search.customerName, { params: { name, page, size } })),
  byCustomerTin: (tin, page = 0, size = 20) => isLocalPosDataMode()
    ? Promise.resolve(responseOf(pageOf(filterMockTransactions({ customerTin: tin }), { page, size })))
    : pageResponse(api.get(API_ENDPOINTS.search.customerTin, { params: { tin, page, size } })),
  byAmountRange: (min, max, page = 0, size = 20) => isLocalPosDataMode()
    ? Promise.resolve(responseOf(pageOf(filterMockTransactions({ minAmount: min, maxAmount: max }), { page, size })))
    : pageResponse(api.get(API_ENDPOINTS.search.amountRange, { params: { minAmount: min, maxAmount: max, page, size } })),
  byPaymentMethod: (method, page = 0, size = 20) => isLocalPosDataMode()
    ? Promise.resolve(responseOf(pageOf(filterMockTransactions({ paymentMethod: method }), { page, size })))
    : pageResponse(api.get(API_ENDPOINTS.search.paymentMethod, { params: { paymentMethod: method, page, size } })),
  recent: (page = 0, size = 20) => isLocalPosDataMode()
    ? Promise.resolve(responseOf(pageOf(readMockTransactions(), { page, size })))
    : pageResponse(api.get(API_ENDPOINTS.search.recent, { params: { page, size } })),
  refunds: (parentTransactionId) => isLocalPosDataMode()
    ? Promise.resolve(responseOf(relatedMockTransactions(parentTransactionId, 'REFUND')))
    : listResponse(api.get(API_ENDPOINTS.search.refunds(parentTransactionId))),
  reversals: (parentTransactionId) => isLocalPosDataMode()
    ? Promise.resolve(responseOf(relatedMockTransactions(parentTransactionId, 'REVERSAL')))
    : listResponse(api.get(API_ENDPOINTS.search.reversals(parentTransactionId))),
  children: (parentTransactionId) => isLocalPosDataMode()
    ? Promise.resolve(responseOf(relatedMockTransactions(parentTransactionId)))
    : listResponse(api.get(API_ENDPOINTS.search.children(parentTransactionId))),
}

// Reports API
export const reportsAPI = {
  fiscalSubmission: (id) => isLocalPosDataMode()
    ? Promise.reject(new ApiError({ message: 'Fiscal submission details are unavailable for browser-only fixture transactions.', status: 404 }))
    : api.get(API_ENDPOINTS.reports.fiscalSubmission(id)),
  fiscalSubmissions: (params = {}) => isLocalPosDataMode()
    ? Promise.resolve(responseOf({
      content: [],
      page: params.page || 0,
      size: params.size || 20,
      totalElements: 0,
      totalPages: 0,
    }))
    : pageResponse(api.get(API_ENDPOINTS.reports.fiscalSubmissions, { params })),
  financialAudit: (dateFrom, dateTo) => {
    if (isLocalPosDataMode()) {
      const transactions = localFinancialAudit(dateFrom, dateTo)
      return localReportResponse({
        dateFrom,
        dateTo,
        dateBasis: 'SETTLEMENT_DATE_WITH_CREATION_DATE_FALLBACK',
        transactions,
        analysis: localFinancialAuditAnalysis(dateFrom, dateTo, transactions),
        ...localFinancialAuditBreakdowns(dateFrom, dateTo),
      })
    }
    return api.get(API_ENDPOINTS.reports.financialAudit, { params: { dateFrom, dateTo } })
  },
  revenue: (dateFrom, dateTo, signal) => isLocalPosDataMode()
    ? localReportResponse(localRevenue(dateFrom, dateTo))
    : api.get(API_ENDPOINTS.reports.revenue, { params: { dateFrom, dateTo }, signal }),
  revenueForYear: (year = new Date().getFullYear()) => reportsAPI.revenue(`${year}-01-01T00:00:00`, `${year}-12-31T23:59:59`),
  vat: (dateFrom, dateTo) => isLocalPosDataMode()
    ? localReportResponse({ vatAmount: localRevenue(dateFrom, dateTo).vatAmount })
    : api.get(API_ENDPOINTS.reports.vat, { params: { dateFrom, dateTo } }),
  vatForYear: (year = new Date().getFullYear()) => reportsAPI.vat(`${year}-01-01T00:00:00`, `${year}-12-31T23:59:59`),
  serviceFees: (dateFrom, dateTo) => isLocalPosDataMode() ? localReportResponse([]) : listResponse(api.get(API_ENDPOINTS.reports.serviceFees, { params: { dateFrom, dateTo } })),
  refunds: (dateFrom, dateTo) => isLocalPosDataMode() ? localReportResponse([]) : listResponse(api.get(API_ENDPOINTS.reports.refunds, { params: { dateFrom, dateTo } })),
  cashierPerformance: (dateFrom, dateTo, signal) => isLocalPosDataMode() ? localReportResponse(localCashierPerformance(dateFrom, dateTo)) : listResponse(api.get(API_ENDPOINTS.reports.cashierPerformance, { params: { dateFrom, dateTo }, signal })),
  paymentMethodBreakdown: (dateFrom, dateTo, signal) => isLocalPosDataMode() ? localReportResponse(localPaymentMethods(dateFrom, dateTo)) : listResponse(api.get(API_ENDPOINTS.reports.paymentMethodBreakdown, { params: { dateFrom, dateTo }, signal })),
  dailySummary: (date) => isLocalPosDataMode() ? localReportResponse(localRevenue(`${date}T00:00:00`, `${date}T23:59:59`)) : api.get(API_ENDPOINTS.reports.dailySummary, { params: { date } }),
  monthlySummary: (year, month) => {
    const from = `${year}-${String(month).padStart(2, '0')}-01T00:00:00`
    const end = new Date(Number(year), Number(month), 0).getDate()
    const to = `${year}-${String(month).padStart(2, '0')}-${end}T23:59:59`
    return isLocalPosDataMode() ? localReportResponse(localRevenue(from, to)) : api.get(API_ENDPOINTS.reports.monthlySummary, { params: { year, month } })
  },
  transactionStats: (dateFrom, dateTo) => isLocalPosDataMode()
    ? localReportResponse({ totalTransactions: rangeTransactions(dateFrom, dateTo).length })
    : api.get(API_ENDPOINTS.reports.transactionStats, { params: { dateFrom, dateTo } }),
  hourlyVolume: (date) => {
    if (!isLocalPosDataMode()) return api.get(API_ENDPOINTS.reports.hourlyVolume, { params: { date } })
    const hours = new Map()
    for (const transaction of rangeTransactions(`${date}T00:00:00`, `${date}T23:59:59`)) {
      const hour = new Date(transaction.createdAt).getHours()
      hours.set(hour, (hours.get(hour) || 0) + 1)
    }
    return localReportResponse([...hours].map(([hour, transactionCount]) => ({ hour, transactionCount })))
  },
  averageTransactionValue: (dateFrom, dateTo) => {
    if (!isLocalPosDataMode()) return api.get(API_ENDPOINTS.reports.averageTransactionValue, { params: { dateFrom, dateTo } })
    const settled = settledTransactions(rangeTransactions(dateFrom, dateTo))
    return localReportResponse({ averageTransactionValue: settled.length ? sum(settled, 'netAmount') / settled.length : 0 })
  },
  averageTransactionValueForYear: (year = new Date().getFullYear()) => reportsAPI.averageTransactionValue(`${year}-01-01T00:00:00`, `${year}-12-31T23:59:59`),
  grossVsNet: (dateFrom, dateTo, signal) => {
    if (!isLocalPosDataMode()) return api.get(API_ENDPOINTS.reports.grossVsNet, { params: { dateFrom, dateTo }, signal })
    const revenue = localRevenue(dateFrom, dateTo)
    return localReportResponse({ grossAmount: revenue.revenue + revenue.vatAmount, netAmount: revenue.revenue, vatAmount: revenue.vatAmount })
  },
  refundRate: (dateFrom, dateTo) => isLocalPosDataMode() ? localReportResponse({ refundRate: 0 }) : api.get(API_ENDPOINTS.reports.refundRate, { params: { dateFrom, dateTo } }),
  topCashiers: (dateFrom, dateTo, limit = 10) => isLocalPosDataMode() ? localReportResponse(localCashierPerformance(dateFrom, dateTo).slice(0, limit)) : listResponse(api.get(API_ENDPOINTS.reports.topCashiers, { params: { dateFrom, dateTo, limit } })),
  topRegisters: (dateFrom, dateTo, limit = 10) => {
    if (!isLocalPosDataMode()) return listResponse(api.get(API_ENDPOINTS.reports.topRegisters, { params: { dateFrom, dateTo, limit } }))
    const groups = new Map()
    for (const transaction of settledTransactions(rangeTransactions(dateFrom, dateTo))) {
      const registerId = transaction.cashRegisterId || 'Unassigned'
      const row = groups.get(registerId) || { registerId, totalRevenue: 0, transactionCount: 0 }
      row.totalRevenue += Number(transaction.netAmount) || 0
      row.transactionCount += 1
      groups.set(registerId, row)
    }
    return localReportResponse([...groups.values()].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, limit))
  },
}

// Additive summary API. Existing report and search endpoints remain available.
export const dashboardAPI = {
  summary: (params, options = {}) => api.get(API_ENDPOINTS.dashboard.summary, {
    params,
    signal: options.signal,
  }),
}

export const currencyAPI = {
  get: () => isLocalPosDataMode()
    ? Promise.resolve(responseOf({ currencyCode: localStorage.getItem('pos_currency_code') || 'ETB' }))
    : api.get(API_ENDPOINTS.settings.currency),
  update: (currencyCode) => {
    if (isLocalPosDataMode()) {
      localStorage.setItem('pos_currency_code', currencyCode)
      return Promise.resolve(responseOf({ currencyCode }))
    }
    return api.put(API_ENDPOINTS.settings.currency, { currencyCode })
  },
}

export const pricingAPI = {
  get: () => {
    if (!isLocalPosDataMode()) return api.get(API_ENDPOINTS.settings.pricing)
    try {
      return Promise.resolve(responseOf({
        serviceFeeRate: Number(localStorage.getItem('pos_service_fee_rate') || 0.02),
        saleWithholdingVatRate: Number(localStorage.getItem('pos_sale_withholding_vat_rate') || 0),
        purchaseWithholdingVatRate: Number(localStorage.getItem('pos_purchase_withholding_vat_rate') || 0),
        vatRates: JSON.parse(localStorage.getItem('pos_vat_rates') || JSON.stringify([
          { categoryCode: 'STANDARD', categoryName: 'Standard Rate', rate: 0.15, rateType: 'STANDARD', active: true },
          { categoryCode: 'REDUCED', categoryName: 'Reduced Rate', rate: 0.05, rateType: 'REDUCED', active: true },
          { categoryCode: 'ZERO', categoryName: 'Zero Rated', rate: 0, rateType: 'ZERO_RATED', active: true },
          { categoryCode: 'EXEMPT', categoryName: 'Exempt', rate: 0, rateType: 'EXEMPT', active: true },
        ])),
      }))
    } catch (error) {
      return Promise.reject(new ApiError({ message: 'Stored pricing settings could not be read.', cause: error }))
    }
  },
  update: (configuration) => {
    if (isLocalPosDataMode()) {
      const rates = configuration.vatRates
      const categoryCodes = Array.isArray(rates) ? rates.map((rate) => rate.categoryCode) : []
      const hasValidRates = Array.isArray(rates)
        && rates.length > 0
        && categoryCodes.every((code) => /^[A-Z0-9_-]{1,50}$/.test(code || ''))
        && new Set(categoryCodes).size === categoryCodes.length
        && rates.every((rate) => Number.isFinite(Number(rate.rate))
          && Number(rate.rate) >= 0
          && Number(rate.rate) <= 1
          && Boolean(String(rate.categoryName || '').trim()))
        && rates.some((rate) => Boolean(rate.active))
      if (!Number.isFinite(Number(configuration.serviceFeeRate))
          || Number(configuration.serviceFeeRate) < 0
          || Number(configuration.serviceFeeRate) > 1
          || !Number.isFinite(Number(configuration.saleWithholdingVatRate))
          || Number(configuration.saleWithholdingVatRate) < 0
          || Number(configuration.saleWithholdingVatRate) > 1
          || !Number.isFinite(Number(configuration.purchaseWithholdingVatRate))
          || Number(configuration.purchaseWithholdingVatRate) < 0
          || Number(configuration.purchaseWithholdingVatRate) > 1
          || !hasValidRates) {
        return Promise.reject(new ApiError({ message: 'Enter valid unique VAT categories and rates, and fee and withholding rates between 0% and 100%.' }))
      }
      localStorage.setItem('pos_service_fee_rate', String(configuration.serviceFeeRate))
      localStorage.setItem('pos_sale_withholding_vat_rate', String(configuration.saleWithholdingVatRate))
      localStorage.setItem('pos_purchase_withholding_vat_rate', String(configuration.purchaseWithholdingVatRate))
      localStorage.setItem('pos_vat_rates', JSON.stringify(configuration.vatRates))
      return Promise.resolve(responseOf(configuration))
    }
    return api.put(API_ENDPOINTS.settings.pricing, configuration)
  },
}

// Bank/BEFA integration API
export const bankPaymentAPI = {
  getTerminalScenarios: async () => {
    const response = await integrationClient.get(API_ENDPOINTS.bankPayments.terminalScenarios)
    return { ...response, data: rowsFrom(response.data) }
  },
  getBefaPayment: async (request = {}) => {
    const identifiers = {
      befaPaymentId: request.befaPaymentId,
      cashRegisterId: request.cashRegisterId ?? '',
      cashierId: request.cashierId ?? '',
      transactionType: request.transactionType === 'SALE' ? 'SALE' : 'PURCHASE',
    }
    const response = await integrationClient.post(
      `${API_ENDPOINTS.bankPayments.base}${API_ENDPOINTS.bankPayments.preview}`,
      identifiers,
    )
    const data = response.data?.body ?? response.data?.data ?? response.data
    return { ...response, data }
  },
  getStatus: async (befaPaymentId) => {
    const response = await integrationClient.get(API_ENDPOINTS.bankPayments.status(befaPaymentId))
    return { ...response, data: response.data?.body ?? response.data?.data ?? response.data }
  },
  lookupTransaction: async (identifier) => {
    const searchValue = String(identifier || '').trim()
    if (!searchValue) throw new ApiError({ message: 'A transaction identifier is required.', status: 400 })

    const normalizedValue = searchValue.toLocaleLowerCase()
    if (isLocalPosDataMode()) {
      const transaction = readMockTransactions().find((item) => [
        item.transactionId,
        item.befaPaymentId,
        item.bankTransactionId,
      ].some((value) => String(value || '').toLocaleLowerCase() === normalizedValue))
      if (transaction) return responseOf(transaction)
      throw new ApiError({ message: 'Transaction was not found for the supplied identifier.', status: 404 })
    }

    let lookupError
    const candidates = [...new Set([searchValue, searchValue.toLocaleUpperCase()])]
    for (const candidate of candidates) {
      try {
        const response = await integrationClient.get(API_ENDPOINTS.bankPayments.lookup(candidate))
        return { ...response, data: response.data?.body ?? response.data?.data ?? response.data }
      } catch (error) {
        if (error.status !== 404) throw error
        lookupError = error
      }
    }

    try {
      return await transactionAPI.getById(searchValue)
    } catch (error) {
      if (error.status !== 404) throw error
      lookupError = error
    }

    for (const field of ['befaPaymentId', 'bankTransactionId']) {
      for (const candidate of candidates) {
        try {
          const response = await searchAPI.transactions({ [field]: candidate, page: 0, size: 100 })
          const match = response.data?.content?.find((item) => (
            String(item[field] || '').toLocaleLowerCase() === normalizedValue
          ))
          if (match) return { ...response, data: match }
        } catch (error) {
          if (error.status !== 404) throw error
          lookupError = error
        }
      }
    }

    throw lookupError || new ApiError({ message: 'Transaction was not found for the supplied identifier.', status: 404 })
  },
  execute: async (request, paymentContext = {}) => {
    const executionRequest = {
      befaPaymentId: request.befaPaymentId,
      cashRegisterId: request.cashRegisterId,
      cashierId: request.cashierId,
      transactionType: paymentContext.transactionType === 'SALE' ? 'SALE' : 'PURCHASE',
      terminalScenarioId: request.terminalScenarioId || undefined,
      pricesIncludeVat: Boolean(request.pricesIncludeVat),
      applyCustomerFee: Boolean(request.applyCustomerFee),
      applyWithholdingVat: Boolean(request.applyWithholdingVat),
      withholdingCertificateNumber: request.withholdingCertificateNumber || null,
      withholdingCertificateDate: request.withholdingCertificateDate || null,
      currencyCode: request.currencyCode || 'ETB',
    }
    const response = await integrationClient.post(paymentIntegrationConfig.endpoints.liveBankPayment, executionRequest)
    return { ...response, data: response.data?.body ?? response.data?.data ?? response.data }
  },
}

export default api
