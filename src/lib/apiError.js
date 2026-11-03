function getValidationMessage(errors) {
  if (Array.isArray(errors)) {
    return errors
      .map((error) => typeof error === 'string' ? error : error?.defaultMessage || error?.message)
      .filter(Boolean)
      .join(' ')
  }

  if (errors && typeof errors === 'object') {
    return Object.entries(errors)
      .map(([field, message]) => `${field}: ${Array.isArray(message) ? message.join(', ') : message}`)
      .join(' ')
  }

  return ''
}

function getStatusMessage(status) {
  if (status === 400) return 'The request is invalid. Check the submitted values.'
  if (status === 401) return 'Authentication is required to complete this request.'
  if (status === 403) return 'You are not authorized to complete this request.'
  if (status === 404) return 'The requested resource was not found.'
  if (status === 409) return 'This request conflicts with the current transaction state.'
  if (status === 422) return 'The submitted data could not be processed.'
  if (status === 429) return 'Too many requests. Please wait and try again.'
  if (status >= 500) return 'The server could not complete the request. Please try again.'
  return status ? `The request failed with status ${status}.` : ''
}

export class ApiError extends Error {
  constructor({ message, status = null, code = null, retryable = false, details = '', response = null, cause = null }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryable = retryable
    this.details = details
    this.response = response
    this.cause = cause
  }

  static from(error) {
    if (error instanceof ApiError) return error

    const response = error?.response || null
    const payload = response?.data
    const status = response?.status ?? null
    
    // Handle new backend error format (ErrorResponseDTO)
    const backendError = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? {
          code: payload.code,
          message: payload.message,
          details: payload.details,
          timestamp: payload.timestamp,
          retryable: payload.retryable,
        }
      : null
    
    // Extract validation errors from old format
    const validationDetails = getValidationMessage(payload?.errors || payload?.violations)
    
    // Determine message
    let message
    if (backendError?.message) {
      message = backendError.message
    } else if (typeof payload === 'string') {
      message = payload
    } else {
      const payloadMessage = [payload?.message, payload?.detail, payload?.title, payload?.error]
        .find((value) => typeof value === 'string' && value.trim())
      message = payloadMessage || validationDetails || getStatusMessage(status)
    }

    if (!message && error?.code === 'ECONNABORTED') {
      message = 'The request timed out. Please try again.'
    } else if (!message && error?.code === 'ERR_CANCELED') {
      message = 'The request was cancelled.'
    } else if (!message && !response && (
      error?.isAxiosError
      || (error instanceof TypeError && /fetch|network/i.test(error.message || ''))
    )) {
      message = 'Unable to reach the server. Check that the backend is running and try again.'
    } else if (!message && !response && error?.message) {
      message = error.message
    } else if (!message) {
      message = 'An unexpected request error occurred.'
    }

    return new ApiError({
      message,
      status,
      code: backendError?.code || payload?.code || error?.code || null,
      retryable: backendError?.retryable ?? payload?.retryable ?? (status === 429 || status >= 500),
      details: backendError?.details || validationDetails || null,
      response,
      cause: error,
    })
  }
}

export function reportApiError(error) {
  const apiError = ApiError.from(error)
  const isReportableHttpFailure = apiError.status >= 400 && apiError.status !== 404
  const isNetworkFailure = apiError.status === null && apiError.code !== 'ERR_CANCELED'

  if (typeof window !== 'undefined' && (isReportableHttpFailure || isNetworkFailure)) {
    if (apiError.status === 401) {
      window.dispatchEvent(new CustomEvent('pos-tax-vat:unauthorized'))
    }
    window.dispatchEvent(new CustomEvent('pos-tax-vat:error', { detail: apiError }))
  }

  return apiError
}

export function getApiErrorMessage(error, fallback = 'An unexpected error occurred.') {
  const normalized = ApiError.from(error)
  return normalized.message || fallback
}