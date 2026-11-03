import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CreditCard, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { transactionAPI, paymentIntegrationConfig } from '@/lib/api'
import { formatCurrency, getStatusClasses, getStatusLabel } from '@/lib/format'
import { getApiErrorMessage } from '@/lib/apiError'
import ErrorNotice from '@/components/ErrorNotice'

export default function BankPayments() {
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadPending = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await transactionAPI.getPending({ page: 0, size: 50 })
      const records = Array.isArray(response.data) ? response.data : response.data?.content || []
      setPending(records)
    } catch (requestError) {
      setPending([])
      setError(getApiErrorMessage(requestError, 'Unable to load pending payments.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPending() }, [loadPending])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-3xl font-bold text-gray-900">Purchase</h1><p className="mt-1 text-gray-500">Review payment outcomes and follow up on pending transactions.</p></div>
        <Link to="/payment-router" state={{ transactionType: 'PURCHASE' }}><Button><CreditCard className="mr-2 h-4 w-4" />New purchase</Button></Link>
      </div>
      {paymentIntegrationConfig.mode === 'fixtures' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Simulation mode:</strong> the POS backend runs the fixture-backed terminal flow. No live bank or card terminal is connected.</div>}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardTitle>Pending transactions</CardTitle><p className="mt-1 text-sm text-gray-500">Check a transaction before attempting another payment.</p></div><Button variant="outline" size="sm" onClick={loadPending} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></CardHeader>
        <CardContent>
          <ErrorNotice message={error} onRetry={loadPending} />
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Transaction</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Action</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan="6" className="px-4 py-10 text-center text-gray-500" role="status">Loading pending payments…</td></tr>
                  : pending.length === 0 ? <tr><td colSpan="6" className="px-4 py-10 text-center text-gray-500">There are no pending payments.</td></tr>
                    : pending.map((record) => <tr key={record.transactionId} className="border-t border-gray-100"><td className="px-4 py-3 font-medium text-gray-900">{record.transactionId}</td><td className="px-4 py-3">{record.customerName || 'Guest'}</td><td className="px-4 py-3">{formatCurrency(record.netAmount)}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(record.status)}`}>{getStatusLabel(record.status)}</span></td><td className="px-4 py-3">{record.createdAt ? new Date(record.createdAt).toLocaleString() : '—'}</td><td className="px-4 py-3"><Link className="font-medium text-blue-700 hover:text-blue-900" to={`/transactions/${encodeURIComponent(record.transactionId)}`}>View details</Link></td></tr>)}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
