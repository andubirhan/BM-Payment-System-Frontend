import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CreditCard, RefreshCw, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { searchAPI, transactionAPI, paymentIntegrationConfig } from '@/lib/api'
import { formatCurrency, getStatusClasses, getStatusLabel } from '@/lib/format'
import { getApiErrorMessage } from '@/lib/apiError'
import ErrorNotice from '@/components/ErrorNotice'

export default function BankPayments() {
  const [purchases, setPurchases] = useState([])
  const [purchasesLoading, setPurchasesLoading] = useState(true)
  const [purchasesError, setPurchasesError] = useState('')
  const [purchasesPage, setPurchasesPage] = useState(0)
  const [purchasesTotalPages, setPurchasesTotalPages] = useState(0)
  const [purchasesTotalElements, setPurchasesTotalElements] = useState(0)
  const [purchasesSearch, setPurchasesSearch] = useState('')
  const [pending, setPending] = useState([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingLoaded, setPendingLoaded] = useState(false)
  const [pendingError, setPendingError] = useState('')
  const [pendingPage, setPendingPage] = useState(0)
  const [pendingTotalPages, setPendingTotalPages] = useState(0)
  const [pendingTotalElements, setPendingTotalElements] = useState(0)
  const [pendingSearch, setPendingSearch] = useState('')
  const pendingSectionRef = useRef(null)
  const pendingLoadStarted = useRef(false)
  const purchasesRequestId = useRef(0)
  const pendingRequestId = useRef(0)

  const loadPurchases = useCallback(async () => {
    const requestId = ++purchasesRequestId.current
    setPurchasesLoading(true)
    setPurchasesError('')
    try {
      const response = purchasesSearch.trim()
        ? await searchAPI.fullText(purchasesSearch.trim(), purchasesPage, 10, { businessTransactionType: 'PURCHASE', excludePending: true })
        : await searchAPI.transactions({ businessTransactionType: 'PURCHASE', excludePending: true, page: purchasesPage, size: 10 })
      if (requestId !== purchasesRequestId.current) return
      const records = Array.isArray(response.data) ? response.data : response.data?.content || []
      setPurchases(records)
      setPurchasesTotalPages(Array.isArray(response.data) ? (records.length ? 1 : 0) : Number(response.data?.totalPages) || 0)
      setPurchasesTotalElements(Array.isArray(response.data) ? records.length : Number(response.data?.totalElements) || 0)
    } catch (requestError) {
      if (requestId !== purchasesRequestId.current) return
      setPurchases([])
      setPurchasesTotalPages(0)
      setPurchasesTotalElements(0)
      if (requestError.status !== 404) {
        setPurchasesError(getApiErrorMessage(requestError, 'Unable to load recent purchases.'))
      }
    } finally {
      if (requestId === purchasesRequestId.current) setPurchasesLoading(false)
    }
  }, [purchasesPage, purchasesSearch])

  const loadPending = useCallback(async (page = pendingPage) => {
    const requestId = ++pendingRequestId.current
    pendingLoadStarted.current = true
    setPendingLoading(true)
    setPendingError('')
    try {
      const response = pendingSearch.trim()
        ? await searchAPI.fullText(pendingSearch.trim(), page, 10, { businessTransactionType: 'PURCHASE', status: 'PENDING' })
        : await transactionAPI.getPending({ businessTransactionType: 'PURCHASE', page, size: 10 })
      if (requestId !== pendingRequestId.current) return
      const records = Array.isArray(response.data) ? response.data : response.data?.content || []
      const matchingRecords = records.filter((record) => String(record.businessTransactionType || record.transactionType || '').toUpperCase() === 'PURCHASE')
      setPending(matchingRecords)
      setPendingTotalPages(Array.isArray(response.data) ? (records.length ? 1 : 0) : Number(response.data?.totalPages) || 0)
      setPendingTotalElements(Array.isArray(response.data) ? matchingRecords.length : Number(response.data?.totalElements) || 0)
    } catch (requestError) {
      if (requestId !== pendingRequestId.current) return
      setPending([])
      setPendingTotalPages(0)
      setPendingTotalElements(0)
      if (requestError.status !== 404 || !pendingSearch.trim()) {
        setPendingError(getApiErrorMessage(requestError, 'Unable to load pending purchases.'))
      }
    } finally {
      if (requestId === pendingRequestId.current) {
        setPendingLoading(false)
        setPendingLoaded(true)
      }
    }
  }, [pendingPage, pendingSearch])

  useEffect(() => {
    const timeoutId = setTimeout(loadPurchases, purchasesSearch.trim() ? 300 : 0)
    return () => {
      clearTimeout(timeoutId)
      purchasesRequestId.current += 1
    }
  }, [loadPurchases, purchasesSearch])

  useEffect(() => {
    if (!pendingLoadStarted.current) return undefined
    const timeoutId = setTimeout(() => loadPending(pendingPage), pendingSearch.trim() ? 300 : 0)
    return () => {
      clearTimeout(timeoutId)
      pendingRequestId.current += 1
    }
  }, [loadPending, pendingPage, pendingSearch])

  useEffect(() => {
    const section = pendingSectionRef.current
    if (!section || pendingLoadStarted.current) return undefined

    const loadWhenVisible = () => {
      if (!pendingLoadStarted.current) loadPending()
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
  }, [loadPending])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-3xl font-bold text-gray-900">Purchase</h1><p className="mt-1 text-gray-500">Review payment outcomes and follow up on pending transactions.</p></div>
        <Link to="/payment-router" state={{ transactionType: 'PURCHASE' }}><Button><CreditCard className="mr-2 h-4 w-4" />New purchase</Button></Link>
      </div>
      {paymentIntegrationConfig.mode === 'fixtures' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Simulation mode:</strong> the POS backend runs the fixture-backed terminal flow. No live bank or card terminal is connected.</div>}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3"><div><CardTitle>Recent purchases</CardTitle><p className="mt-1 text-sm text-gray-500">The latest purchase transactions recorded by the POS.</p></div><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><div className="relative w-full sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" /><Input value={purchasesSearch} onChange={(event) => { setPurchasesSearch(event.target.value); setPurchasesPage(0); setPurchasesLoading(true) }} placeholder="Search all purchases" className="pl-9" aria-label="Search all purchases" /></div><Button variant="outline" size="sm" onClick={loadPurchases} disabled={purchasesLoading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div></CardHeader>
        <CardContent>
          <ErrorNotice message={purchasesError} onRetry={loadPurchases} />
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Transaction</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Action</th></tr></thead>
              <tbody>
                {purchasesLoading ? <tr><td colSpan="6" className="px-4 py-10 text-center text-gray-500" role="status">Loading recent purchases…</td></tr>
                  : purchases.length === 0 ? <tr><td colSpan="6" className="px-4 py-10 text-center text-gray-500">{purchasesSearch.trim() ? 'No purchases match your search.' : 'There are no recent purchases.'}</td></tr>
                    : purchases.map((record) => <tr key={record.transactionId} className="border-t border-gray-100"><td className="px-4 py-3 font-medium text-gray-900">{record.transactionId}</td><td className="px-4 py-3">{record.customerName || 'Guest'}</td><td className="px-4 py-3">{formatCurrency(record.netAmount, record.currencyCode)}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(record.status)}`}>{getStatusLabel(record.status)}</span></td><td className="px-4 py-3">{record.createdAt ? new Date(record.createdAt).toLocaleString() : '—'}</td><td className="px-4 py-3"><Link className="font-medium text-[#9B2635] hover:text-[#7D1E2A]" to={`/transactions/${encodeURIComponent(record.transactionId)}`}>View details</Link></td></tr>)}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {purchasesTotalPages > 1 && <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{purchasesSearch.trim() ? `Search results page ${purchasesPage + 1} of ${purchasesTotalPages} (${purchasesTotalElements} matches)` : `Page ${purchasesPage + 1} of ${purchasesTotalPages}`}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setPurchasesPage((page) => page - 1)} disabled={purchasesLoading || purchasesPage === 0}>Previous</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setPurchasesPage((page) => page + 1)} disabled={purchasesLoading || purchasesPage >= purchasesTotalPages - 1}>Next</Button>
        </div>
      </div>}
      <div ref={pendingSectionRef}>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3"><div><CardTitle>Pending purchases</CardTitle><p className="mt-1 text-sm text-gray-500">Pending transactions classified as purchases.</p></div><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><div className="relative w-full sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" /><Input value={pendingSearch} onChange={(event) => { setPendingSearch(event.target.value); setPendingPage(0); if (pendingLoadStarted.current) setPendingLoading(true) }} placeholder="Search all pending purchases" className="pl-9" aria-label="Search all pending purchases" /></div><Button variant="outline" size="sm" onClick={loadPending} disabled={pendingLoading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div></CardHeader>
        <CardContent>
          <ErrorNotice message={pendingError} onRetry={loadPending} />
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Transaction</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Action</th></tr></thead>
              <tbody>
                {pendingLoading ? <tr><td colSpan="6" className="px-4 py-10 text-center text-gray-500" role="status">Loading pending purchases…</td></tr>
                  : !pendingLoaded ? <tr><td colSpan="6" className="px-4 py-10 text-center text-gray-500">Pending purchases load when this section is reached.</td></tr>
                    : pending.length === 0 ? <tr><td colSpan="6" className="px-4 py-10 text-center text-gray-500">{pendingSearch.trim() ? 'No pending purchases match your search.' : 'There are no pending purchases in the loaded results.'}</td></tr>
                      : pending.map((record) => <tr key={record.transactionId} className="border-t border-gray-100"><td className="px-4 py-3 font-medium text-gray-900">{record.transactionId}</td><td className="px-4 py-3">{record.customerName || 'Guest'}</td><td className="px-4 py-3">{formatCurrency(record.netAmount, record.currencyCode)}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(record.status || 'PENDING')}`}>{getStatusLabel(record.status || 'PENDING')}</span></td><td className="px-4 py-3">{record.createdAt ? new Date(record.createdAt).toLocaleString() : '—'}</td><td className="px-4 py-3"><Link className="font-medium text-[#9B2635] hover:text-[#7D1E2A]" to={`/transactions/${encodeURIComponent(record.transactionId)}`}>View details</Link></td></tr>)}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {pendingTotalPages > 1 && <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{pendingSearch.trim() ? `Search results page ${pendingPage + 1} of ${pendingTotalPages} (${pendingTotalElements} matches)` : `Page ${pendingPage + 1} of ${pendingTotalPages}`}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setPendingPage((page) => Math.max(0, page - 1))} disabled={pendingLoading || pendingPage === 0}>Previous</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setPendingPage((page) => page + 1)} disabled={pendingLoading || pendingPage >= pendingTotalPages - 1}>Next</Button>
        </div>
      </div>}
      </div>
    </div>
  )
}
