import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import ErrorNotice from '@/components/ErrorNotice'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency, getStatusClasses, getStatusLabel } from '@/lib/format'
import { searchAPI, transactionAPI } from '@/lib/api'

export default function Sales() {
  const [sales, setSales] = useState([])
  const [salesLoading, setSalesLoading] = useState(true)
  const [salesError, setSalesError] = useState('')
  const [salesPage, setSalesPage] = useState(0)
  const [salesTotalPages, setSalesTotalPages] = useState(0)
  const [salesTotalElements, setSalesTotalElements] = useState(0)
  const [salesSearch, setSalesSearch] = useState('')
  const [pendingSales, setPendingSales] = useState([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingLoaded, setPendingLoaded] = useState(false)
  const [pendingError, setPendingError] = useState('')
  const [pendingPage, setPendingPage] = useState(0)
  const [pendingTotalPages, setPendingTotalPages] = useState(0)
  const [pendingTotalElements, setPendingTotalElements] = useState(0)
  const [pendingSalesSearch, setPendingSalesSearch] = useState('')
  const pendingSectionRef = useRef(null)
  const pendingLoadStarted = useRef(false)
  const salesRequestId = useRef(0)
  const pendingRequestId = useRef(0)

  const loadSales = useCallback(async () => {
    const requestId = ++salesRequestId.current
    setSalesLoading(true)
    setSalesError('')
    try {
      const response = salesSearch.trim()
        ? await searchAPI.fullText(salesSearch.trim(), salesPage, 10, { businessTransactionType: 'SALE', excludePending: true })
        : await searchAPI.transactions({ businessTransactionType: 'SALE', excludePending: true, page: salesPage, size: 10 })
      if (requestId !== salesRequestId.current) return
      const records = Array.isArray(response.data) ? response.data : response.data?.content || []
      setSales(records)
      setSalesTotalPages(Array.isArray(response.data) ? (records.length ? 1 : 0) : Number(response.data?.totalPages) || 0)
      setSalesTotalElements(Array.isArray(response.data) ? records.length : Number(response.data?.totalElements) || 0)
    } catch (requestError) {
      if (requestId !== salesRequestId.current) return
      setSales([])
      setSalesTotalPages(0)
      setSalesTotalElements(0)
      if (requestError.status !== 404) {
        setSalesError(getApiErrorMessage(requestError, 'Unable to load recent sales.'))
      }
    } finally {
      if (requestId === salesRequestId.current) setSalesLoading(false)
    }
  }, [salesPage, salesSearch])

  const loadPendingSales = useCallback(async (page = pendingPage) => {
    const requestId = ++pendingRequestId.current
    pendingLoadStarted.current = true
    setPendingLoading(true)
    setPendingError('')
    try {
      const response = pendingSalesSearch.trim()
        ? await searchAPI.fullText(pendingSalesSearch.trim(), page, 10, { businessTransactionType: 'SALE', status: 'PENDING' })
        : await transactionAPI.getPending({ businessTransactionType: 'SALE', page, size: 10 })
      if (requestId !== pendingRequestId.current) return
      const records = Array.isArray(response.data) ? response.data : response.data?.content || []
      const matchingRecords = records.filter((record) => String(record.businessTransactionType || record.transactionType || '').toUpperCase() === 'SALE')
      setPendingSales(matchingRecords)
      setPendingTotalPages(Array.isArray(response.data) ? (records.length ? 1 : 0) : Number(response.data?.totalPages) || 0)
      setPendingTotalElements(Array.isArray(response.data) ? matchingRecords.length : Number(response.data?.totalElements) || 0)
    } catch (requestError) {
      if (requestId !== pendingRequestId.current) return
      setPendingSales([])
      setPendingTotalPages(0)
      setPendingTotalElements(0)
      if (requestError.status !== 404 || !pendingSalesSearch.trim()) {
        setPendingError(getApiErrorMessage(requestError, 'Unable to load pending sales.'))
      }
    } finally {
      if (requestId === pendingRequestId.current) {
        setPendingLoading(false)
        setPendingLoaded(true)
      }
    }
  }, [pendingPage, pendingSalesSearch])

  useEffect(() => {
    const timeoutId = setTimeout(loadSales, salesSearch.trim() ? 300 : 0)
    return () => {
      clearTimeout(timeoutId)
      salesRequestId.current += 1
    }
  }, [loadSales, salesSearch])

  useEffect(() => {
    if (!pendingLoadStarted.current) return undefined
    const timeoutId = setTimeout(() => loadPendingSales(pendingPage), pendingSalesSearch.trim() ? 300 : 0)
    return () => {
      clearTimeout(timeoutId)
      pendingRequestId.current += 1
    }
  }, [loadPendingSales, pendingPage, pendingSalesSearch])

  useEffect(() => {
    const section = pendingSectionRef.current
    if (!section || pendingLoadStarted.current) return undefined

    const loadWhenVisible = () => {
      if (!pendingLoadStarted.current) loadPendingSales()
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
  }, [loadPendingSales])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">SALE</h1>
          <p className="mt-1 text-gray-500">Start a sale and review recent sales.</p>
        </div>
        <Link to="/payment-router" state={{ transactionType: 'SALE' }}>
          <Button><Plus className="mr-2 h-4 w-4" />New sale</Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Recent sales</CardTitle>
            <p className="mt-1 text-sm text-gray-500">The latest sales recorded by the POS terminal.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <Input value={salesSearch} onChange={(event) => { setSalesSearch(event.target.value); setSalesPage(0); setSalesLoading(true) }} placeholder="Search all sales" className="pl-9" aria-label="Search all sales" />
            </div>
            <Button variant="outline" size="sm" onClick={loadSales} disabled={salesLoading}>
              <RefreshCw className="mr-2 h-4 w-4" />Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ErrorNotice message={salesError} onRetry={loadSales} />
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Transaction</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {salesLoading ? (
                  <tr><td colSpan="6" className="px-4 py-10 text-center text-gray-500" role="status">Loading recent sales…</td></tr>
                ) : sales.length === 0 ? (
                  salesSearch.trim()
                    ? <tr><td colSpan="6" className="px-4 py-10 text-center text-gray-500">No sales match your search.</td></tr>
                    : <tr><td colSpan="6" className="px-4 py-10 text-center text-gray-500">There are no recent sales.</td></tr>
                ) : sales.map((sale) => (
                  <tr key={sale.transactionId} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium text-gray-900">{sale.transactionId}</td>
                    <td className="px-4 py-3">{sale.customerName || 'Guest'}</td>
                    <td className="px-4 py-3">{formatCurrency(sale.netAmount, sale.currencyCode)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(sale.status)}`}>
                        {getStatusLabel(sale.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{sale.createdAt ? new Date(sale.createdAt).toLocaleString() : '—'}</td>
                    <td className="px-4 py-3">
                      <Link className="font-medium text-[#9B2635] hover:text-[#7D1E2A]" to={`/transactions/${encodeURIComponent(sale.transactionId)}`}>
                        View details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {salesTotalPages > 1 && <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{salesSearch.trim() ? `Search results page ${salesPage + 1} of ${salesTotalPages} (${salesTotalElements} matches)` : `Page ${salesPage + 1} of ${salesTotalPages}`}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setSalesPage((page) => page - 1)} disabled={salesLoading || salesPage === 0}>Previous</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setSalesPage((page) => page + 1)} disabled={salesLoading || salesPage >= salesTotalPages - 1}>Next</Button>
        </div>
      </div>}

      <div ref={pendingSectionRef}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Pending sales</CardTitle>
            <p className="mt-1 text-sm text-gray-500">Pending transactions classified as sales.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <Input value={pendingSalesSearch} onChange={(event) => { setPendingSalesSearch(event.target.value); setPendingPage(0); if (pendingLoadStarted.current) setPendingLoading(true) }} placeholder="Search all pending sales" className="pl-9" aria-label="Search all pending sales" />
            </div>
            <Button variant="outline" size="sm" onClick={loadPendingSales} disabled={pendingLoading}>
              <RefreshCw className="mr-2 h-4 w-4" />Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ErrorNotice message={pendingError} onRetry={loadPendingSales} />
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Transaction</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingLoading ? (
                  <tr><td colSpan="6" className="px-4 py-10 text-center text-gray-500" role="status">Loading pending sales…</td></tr>
                ) : !pendingLoaded ? (
                  <tr><td colSpan="6" className="px-4 py-10 text-center text-gray-500">Pending sales load when this section is reached.</td></tr>
                ) : pendingSales.length === 0 ? (
                  pendingSalesSearch.trim()
                    ? <tr><td colSpan="6" className="px-4 py-10 text-center text-gray-500">No pending sales match your search.</td></tr>
                    : <tr><td colSpan="6" className="px-4 py-10 text-center text-gray-500">There are no pending sales in the loaded results.</td></tr>
                ) : pendingSales.map((sale) => (
                  <tr key={sale.transactionId} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium text-gray-900">{sale.transactionId}</td>
                    <td className="px-4 py-3">{sale.customerName || 'Guest'}</td>
                    <td className="px-4 py-3">{formatCurrency(sale.netAmount, sale.currencyCode)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(sale.status || 'PENDING')}`}>
                        {getStatusLabel(sale.status || 'PENDING')}
                      </span>
                    </td>
                    <td className="px-4 py-3">{sale.createdAt ? new Date(sale.createdAt).toLocaleString() : '—'}</td>
                    <td className="px-4 py-3">
                      <Link className="font-medium text-[#9B2635] hover:text-[#7D1E2A]" to={`/transactions/${encodeURIComponent(sale.transactionId)}`}>
                        View details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {pendingTotalPages > 1 && <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{pendingSalesSearch.trim() ? `Search results page ${pendingPage + 1} of ${pendingTotalPages} (${pendingTotalElements} matches)` : `Page ${pendingPage + 1} of ${pendingTotalPages}`}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => {
            const page = Math.max(0, pendingPage - 1)
            setPendingPage(page)
          }} disabled={pendingLoading || pendingPage === 0}>Previous</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => {
            const page = pendingPage + 1
            setPendingPage(page)
          }} disabled={pendingLoading || pendingPage >= pendingTotalPages - 1}>Next</Button>
        </div>
      </div>}
      </div>
    </div>
  )
}
