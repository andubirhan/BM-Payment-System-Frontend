import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, Plus, Eye, RefreshCw, X } from 'lucide-react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { searchAPI } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/apiError'
import ErrorNotice from '@/components/ErrorNotice'
import PersistentNotification from '@/components/PersistentNotification'
import { format } from 'date-fns'
import { formatCurrency, getStatusClasses, getStatusLabel } from '@/lib/format'

export default function Transactions() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeSearch = searchParams.get('q') || ''
  const page = Math.max(0, Number(searchParams.get('page')) || 0)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState(activeSearch)
  const [totalPages, setTotalPages] = useState(0)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [paymentNotice, setPaymentNotice] = useState(location.state?.paymentNotice || null)
  const [popupNotice, setPopupNotice] = useState(location.state?.paymentNotice || null)
  const [transactionResponse, setTransactionResponse] = useState(location.state?.transactionResponse || null)

  useEffect(() => {
    const notice = location.state?.paymentNotice
    const response = location.state?.transactionResponse
    if (!notice && !response) return
    if (notice) {
      setPaymentNotice(notice)
      setPopupNotice(notice)
    }
    if (response) setTransactionResponse(response)
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
  }, [location, navigate])

  const updateUrl = useCallback((query, nextPage = 0) => {
    const next = new URLSearchParams()
    if (query) next.set('q', query)
    if (nextPage > 0) next.set('page', String(nextPage))
    setSearchParams(next)
  }, [setSearchParams])

  useEffect(() => {
    let ignoreResponse = false

    const loadTransactions = async () => {
      try {
        setLoading(true)
        setLoadError('')
        const response = activeSearch
          ? await searchAPI.fullText(activeSearch, page, 20)
          : await searchAPI.recent(page, 20)

        if (!ignoreResponse) {
          setTransactions(response.data?.content || [])
          setTotalPages(response.data?.totalPages || 0)
        }
      } catch (error) {
        if (!ignoreResponse) {
          setTransactions([])
          setTotalPages(0)
          setLoadError(error.status === 404 ? '' : getApiErrorMessage(error, 'Unable to load transactions.'))
        }
      } finally {
        if (!ignoreResponse) setLoading(false)
      }
    }

    loadTransactions()
    return () => {
      ignoreResponse = true
    }
  }, [activeSearch, page, refreshVersion])

  useEffect(() => { setSearchTerm(activeSearch) }, [activeSearch])

  useEffect(() => {
    const query = searchTerm.trim()
    if (query === activeSearch) return undefined

    const timeoutId = setTimeout(() => {
      updateUrl(query)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchTerm, activeSearch, updateUrl])

  const handleSearch = (e) => {
    e.preventDefault()
    const query = searchTerm.trim()
    setSearchTerm(query)
    updateUrl(query)
    if (query === activeSearch && page === 0) {
      setRefreshVersion((version) => version + 1)
    }
  }

  const handleClearSearch = () => {
    setSearchTerm('')
    updateUrl('')
    if (!activeSearch && page === 0) {
      setRefreshVersion((version) => version + 1)
    }
  }

  return (
    <div className="space-y-6">
      {popupNotice && (
        <PersistentNotification
          type={popupNotice.type}
          message={popupNotice.message}
          onClose={() => setPopupNotice(null)}
          duration={3000}
        />
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
          <p className="text-gray-500 mt-1">Manage all POS transactions</p>
        </div>
        <Link to="/payment-router" state={{ from: `${location.pathname}${location.search}` }}>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Transaction
          </Button>
        </Link>
      </div>

      {paymentNotice && (
        <div className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${paymentNotice.type === 'success' ? 'border-green-200 bg-green-50 text-green-900' : 'border-red-200 bg-red-50 text-red-900'}`} role={paymentNotice.type === 'success' ? 'status' : 'alert'}>
          <span>{paymentNotice.message}</span>
          <button type="button" onClick={() => setPaymentNotice(null)} className="font-semibold" aria-label="Dismiss payment notification">Dismiss</button>
        </div>
      )}

      {transactionResponse && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>{transactionResponse.transactionType || (transactionResponse.transactionId ? 'Transaction' : 'Backend error')} response</CardTitle>
              <p className="mt-1 text-sm text-gray-500">The backend returned the following transaction details.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setTransactionResponse(null)}>Dismiss</Button>
          </CardHeader>
          <CardContent className="space-y-5">
            {transactionResponse.transactionId ? <dl className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <ResponseValue label="Transaction ID" value={transactionResponse.transactionId} />
              <ResponseValue label="Transaction type" value={transactionResponse.transactionType} />
              <div><dt className="text-xs font-medium text-gray-500">Status</dt><dd className="mt-1"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(transactionResponse.status)}`}>{getStatusLabel(transactionResponse.status)}</span></dd></div>
              <ResponseValue label="BEFA payment ID" value={transactionResponse.befaPaymentId} />
              <ResponseValue label="Bank transaction ID" value={transactionResponse.bankTransactionId} />
              <ResponseValue label="Parent transaction ID" value={transactionResponse.parentTransactionId} />
              <ResponseValue label="Gross amount" value={formatCurrency(transactionResponse.grossAmount, transactionResponse.currencyCode)} />
              <ResponseValue label="Net amount" value={formatCurrency(transactionResponse.netAmount, transactionResponse.currencyCode)} />
              <ResponseValue label="VAT" value={formatCurrency(transactionResponse.vatAmount, transactionResponse.currencyCode)} />
              <ResponseValue label="Withholding VAT" value={`−${formatCurrency(Math.abs(Number(transactionResponse.withholdingVatAmount) || 0), transactionResponse.currencyCode)}`} />
              <ResponseValue label="Service fees" value={formatCurrency(transactionResponse.serviceFeeAmount, transactionResponse.currencyCode)} />
              <ResponseValue label="Amount paid" value={formatCurrency(transactionResponse.totalAmountPaid, transactionResponse.currencyCode)} />
              {String(transactionResponse.businessTransactionType || transactionResponse.transactionType || '').toUpperCase() === 'SALE' && <>
                <ResponseValue label="Refunded amount" value={formatCurrency(transactionResponse.refundedAmount, transactionResponse.currencyCode)} />
                <ResponseValue label="Refundable amount" value={formatCurrency(transactionResponse.refundableAmount, transactionResponse.currencyCode)} />
              </>}
              <ResponseValue label="Pre-authorization hold" value={formatCurrency(transactionResponse.preauthHoldAmount, transactionResponse.currencyCode)} />
              <ResponseValue label="Captured at" value={transactionResponse.capturedAt} />
              <ResponseValue label="Pre-authorization expires" value={transactionResponse.preauthExpiresAt} />
              <ResponseValue label="Settled at" value={transactionResponse.settledAt} />
              <ResponseValue label="Cancellation reason" value={transactionResponse.cancellationReason} />
              <ResponseValue label="Fiscal reference" value={transactionResponse.fiscalReference} />
              <ResponseValue label="Fiscal signature" value={transactionResponse.fiscalSignature} />
              <ResponseValue label="Fiscal submission status" value={transactionResponse.fiscalSubmissionStatus} />
              <ResponseValue label="Fiscal submission mode" value={transactionResponse.fiscalSubmissionMode} />
              <ResponseValue label="Authority response code" value={transactionResponse.fiscalAuthorityResponseCode} />
              <ResponseValue label="Authority response" value={transactionResponse.fiscalAuthorityResponseMessage} />
              <ResponseValue label="Fiscal submission time" value={transactionResponse.fiscalSubmittedToAuthorityAt} />
            </dl> : <dl className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
              <ResponseValue label="Error code" value={transactionResponse.code} />
              <ResponseValue label="Message" value={transactionResponse.message || transactionResponse.detail || transactionResponse.error} />
              <ResponseValue label="Field" value={transactionResponse.field} />
              <ResponseValue label="Retryable" value={transactionResponse.retryable === undefined ? null : String(transactionResponse.retryable)} />
            </dl>}
            <details className="border-t border-gray-100 pt-4">
              <summary className="cursor-pointer text-sm font-medium text-blue-700">View complete backend response</summary>
              <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-gray-50 p-4 text-xs text-gray-700">{JSON.stringify(transactionResponse, null, 2)}</pre>
            </details>
            {transactionResponse.transactionId && <Link className="inline-flex text-sm font-semibold text-blue-700 hover:text-blue-900" to={`/transactions/${encodeURIComponent(transactionResponse.transactionId)}`}>Open transaction details</Link>}
          </CardContent>
        </Card>
      )}

      {!transactionResponse && <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{activeSearch ? `Results for "${activeSearch}"` : 'Recent Transactions'}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setRefreshVersion((version) => version + 1)} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ErrorNotice message={loadError} onRetry={() => setRefreshVersion((version) => version + 1)} />
          <form onSubmit={handleSearch} className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                aria-label="Search transactions by ID or customer"
                placeholder="Search by transaction ID, customer name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            {(searchTerm || activeSearch) && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleClearSearch}
                aria-label="Clear search"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button type="submit">Search</Button>
          </form>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-500">Loading...</div>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transaction ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>VAT</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-gray-500">
                        {loadError
                          ? 'Transactions are unavailable.'
                          : activeSearch
                          ? `No transactions found for "${activeSearch}"`
                          : 'No recent transactions'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((tx) => (
                      <TableRow key={tx.transactionId}>
                        <TableCell className="font-medium">{tx.transactionId}</TableCell>
                        <TableCell>{tx.transactionType}</TableCell>
                        <TableCell>{tx.customerName || 'Guest'}</TableCell>
                        <TableCell>{formatCurrency(tx.netAmount, tx.currencyCode)}</TableCell>
                        <TableCell>{formatCurrency(tx.totalVat, tx.currencyCode)}</TableCell>
                        <TableCell>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(tx.status)}`}>
                            {getStatusLabel(tx.status)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {tx.createdAt ? format(new Date(tx.createdAt), 'MMM dd, yyyy HH:mm') : '-'}
                        </TableCell>
                        <TableCell>
                          <Link to={`/transactions/${encodeURIComponent(tx.transactionId)}`} aria-label={`View transaction ${tx.transactionId}`} title="View transaction details" className="inline-flex rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-gray-500">
                    Page {page + 1} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateUrl(activeSearch, Math.max(0, page - 1))}
                      disabled={page === 0}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateUrl(activeSearch, Math.min(totalPages - 1, page + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>}
    </div>
  )
}

function ResponseValue({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return <div className="min-w-0"><dt className="text-xs font-medium text-gray-500">{label}</dt><dd className="mt-1 break-all text-sm font-medium text-gray-900">{value}</dd></div>
}
