import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ErrorNotice from '@/components/ErrorNotice'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency, getStatusClasses, getStatusLabel } from '@/lib/format'
import { searchAPI } from '@/lib/api'

export default function Sales() {
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadSales = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await searchAPI.transactions({ transactionType: 'SALE', page: 0, size: 50 })
      const records = Array.isArray(response.data) ? response.data : response.data?.content || []
      setSales(records)
    } catch (requestError) {
      setSales([])
      if (requestError.status !== 404) {
        setError(getApiErrorMessage(requestError, 'Unable to load recent sales.'))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSales()
  }, [loadSales])

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
          <Button variant="outline" size="sm" onClick={loadSales} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <ErrorNotice message={error} onRetry={loadSales} />
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
                {loading ? (
                  <tr><td colSpan="6" className="px-4 py-10 text-center text-gray-500" role="status">Loading recent sales…</td></tr>
                ) : sales.length === 0 ? (
                  <tr><td colSpan="6" className="px-4 py-10 text-center text-gray-500">There are no recent sales.</td></tr>
                ) : sales.map((sale) => (
                  <tr key={sale.transactionId} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium text-gray-900">{sale.transactionId}</td>
                    <td className="px-4 py-3">{sale.customerName || 'Guest'}</td>
                    <td className="px-4 py-3">{formatCurrency(sale.netAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(sale.status)}`}>
                        {getStatusLabel(sale.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{sale.createdAt ? new Date(sale.createdAt).toLocaleString() : '—'}</td>
                    <td className="px-4 py-3">
                      <Link className="font-medium text-blue-700 hover:text-blue-900" to={`/transactions/${encodeURIComponent(sale.transactionId)}`}>
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
    </div>
  )
}
