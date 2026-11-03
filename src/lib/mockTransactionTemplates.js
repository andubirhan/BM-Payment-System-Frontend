import { reportApiError } from '@/lib/apiError'

const TEMPLATE_URLS = Object.freeze({
  PURCHASE: '/mock-api/befa-payment.json',
  SALE: '/mock-api/befa-payment-sale.json',
})

const API_URL = '/api/v1/test-transaction-data'

function normalizeType(transactionType) {
  const type = String(transactionType || '').trim().toUpperCase()
  if (!Object.hasOwn(TEMPLATE_URLS, type)) {
    throw new Error('Choose either a purchase or sale transaction.')
  }
  return type
}

function validateTemplate(template, type) {
  if (!template || typeof template !== 'object' || Array.isArray(template)) {
    throw new Error(`The ${type.toLowerCase()} template must be a JSON object.`)
  }
  return template
}

function authHeaders(headers = {}) {
  const token = window.localStorage.getItem('jwt_token')
  return {
    Accept: 'application/json',
    ...headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function readResponse(response, type) {
  if (!response.ok) {
    let body = null
    try {
      body = await response.json()
    } catch {
      body = null
    }
    const apiError = reportApiError({
      response: { status: response.status, data: body },
      isAxiosError: true,
    })
    throw new Error(`Could not access the ${type.toLowerCase()} template: ${apiError.message}`)
  }
  return response.json()
}

export async function loadMockTransactionTemplate(transactionType) {
  const type = normalizeType(transactionType)

  let savedResponse
  try {
    savedResponse = await fetch(`${API_URL}/${type}`, {
      headers: authHeaders(),
      cache: 'no-store',
    })
  } catch (requestError) {
    throw reportApiError(requestError)
  }
  if (savedResponse.ok) {
    return validateTemplate(await savedResponse.json(), type)
  }
  if (savedResponse.status !== 404) {
    await readResponse(savedResponse, type)
  }

  const response = await fetch(TEMPLATE_URLS[type], {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`Could not load the ${type.toLowerCase()} fixture (${response.status}).`)
  }
  return validateTemplate(await response.json(), type)
}

export async function saveMockTransactionTemplate(transactionType, template) {
  const type = normalizeType(transactionType)
  validateTemplate(template, type)
  const befaPaymentId = String(template.befaPaymentId || '').trim()
  if (!befaPaymentId) {
    throw new Error('BEFA payment ID is required before saving a template.')
  }
  let response
  try {
    response = await fetch(`${API_URL}/${type}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(template),
    })
  } catch (requestError) {
    throw reportApiError(requestError)
  }
  await readResponse(response, type)
  return befaPaymentId
}
