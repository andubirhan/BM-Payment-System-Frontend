import { useEffect, useState } from 'react'
import { Banknote, Calendar, CreditCard, DollarSign, Landmark, ShoppingCart, Smartphone, TrendingUp, Users, Wallet, ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { format, startOfMonth } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { dashboardAPI } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency, getStatusClasses, getStatusLabel } from '@/lib/format'
import ErrorNotice from '@/components/ErrorNotice'

const PAYMENT_METHOD_COLORS = [
  { icon: 'bg-sky-100 text-sky-700', bar: 'bg-sky-600' },
  { icon: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-600' },
  { icon: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500' },
  { icon: 'bg-rose-100 text-rose-700', bar: 'bg-rose-600' },
  { icon: 'bg-cyan-100 text-cyan-700', bar: 'bg-cyan-600' },
]

function formatPaymentMethod(value) {
  return String(value || 'Unknown')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function getPaymentMethodIcon(value) {
  const method = String(value || '').toUpperCase()
  if (method.includes('CASH')) return Banknote
  if (method.includes('BANK') || method.includes('TRANSFER')) return Landmark
  if (method.includes('MOBILE') || method.includes('MPESA') || method.includes('M-PESA')) return Smartphone
  if (method.includes('CARD')) return CreditCard
  return Wallet
}

function percent(current, previous) {
  if (!Number.isFinite(Number(current)) || !Number.isFinite(Number(previous))) return undefined
  if (Number(previous) === 0) return Number(current) === 0 ? 0 : null
  return ((Number(current) - Number(previous)) / Math.abs(Number(previous))) * 100
}

function dateRangePeriod(dateFrom, dateTo) {
  const currentStart = new Date(`${dateFrom}T00:00:00`)
  const currentEnd = new Date(`${dateTo}T23:59:59`)
  const rangeDays = Math.round((currentEnd.setHours(0, 0, 0, 0) - currentStart.getTime()) / 86400000) + 1
  const previousEnd = new Date(currentStart)
  previousEnd.setDate(previousEnd.getDate() - 1)
  previousEnd.setHours(23, 59, 59, 0)
  const previousStart = new Date(previousEnd)
  previousStart.setDate(previousStart.getDate() - rangeDays + 1)
  previousStart.setHours(0, 0, 0, 0)
  const stamp = (value) => format(value, "yyyy-MM-dd'T'HH:mm:ss")
  return { dateFrom: stamp(currentStart), dateTo: stamp(new Date(`${dateTo}T23:59:59`)), previousDateFrom: stamp(previousStart), previousDateTo: stamp(previousEnd) }
}

export default function Dashboard() {
  const today = new Date()
  const initialRange = {
    from: format(startOfMonth(today), 'yyyy-MM-dd'),
    to: format(today, 'yyyy-MM-dd'),
  }
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dateRange, setDateRange] = useState(initialRange)
  const [appliedRange, setAppliedRange] = useState(initialRange)
  const [rangeError, setRangeError] = useState('')

  const load = async (range, signal) => {
    setLoading(true)
    setError('')
    try {
      const response = await dashboardAPI.summary(dateRangePeriod(range.from, range.to), { signal })
      setData(response.data)
    } catch (requestError) {
      if (requestError?.code !== 'ERR_CANCELED') setError(getApiErrorMessage(requestError, 'Unable to load dashboard data.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    load(appliedRange, controller.signal)
    return () => controller.abort()
  }, [appliedRange])

  const applyDateRange = (event) => {
    event.preventDefault()
    if (!dateRange.from || !dateRange.to) {
      setRangeError('Choose both a start date and an end date.')
      return
    }
    if (dateRange.from > dateRange.to) {
      setRangeError('The start date must be on or before the end date.')
      return
    }
    setRangeError('')
    setAppliedRange({ ...dateRange })
  }
  const current = data?.current || {}
  const previous = data?.previous || {}
  const paymentMethods = Array.isArray(data?.paymentMethods) ? data.paymentMethods : []
  const paymentMethodTotal = paymentMethods.reduce((total, row) => total + Math.max(0, Number(row.totalAmount) || 0), 0)
  const cards = [
    ['Net total', current.totalRevenue, previous.totalRevenue, DollarSign, true],
    ['Transactions', current.totalTransactions, previous.totalTransactions, ShoppingCart, false],
    ['VAT collected', current.totalVAT, previous.totalVAT, TrendingUp, true],
    ['Avg. transaction', current.avgTransactionValue, previous.avgTransactionValue, Users, true],
  ]

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-bold text-gray-900">Dashboard</h1><p className="mt-1 text-gray-500">Overview of your POS performance</p><p className="mt-1 text-xs text-gray-400">Period: {format(new Date(`${appliedRange.from}T00:00:00`), 'MMM d')}–{format(new Date(`${appliedRange.to}T00:00:00`), 'MMM d, yyyy')}</p></div><Link to="/payment-router"><Button>New payment</Button></Link></div>
    <Card>
      <CardContent className="pt-6">
        <form className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={applyDateRange}>
          <div><label htmlFor="dashboard-date-from" className="mb-1 block text-sm font-medium text-gray-700">From</label><Input id="dashboard-date-from" type="date" value={dateRange.from} onChange={(event) => setDateRange((range) => ({ ...range, from: event.target.value }))} /></div>
          <div><label htmlFor="dashboard-date-to" className="mb-1 block text-sm font-medium text-gray-700">To</label><Input id="dashboard-date-to" type="date" value={dateRange.to} onChange={(event) => setDateRange((range) => ({ ...range, to: event.target.value }))} /></div>
          <Button type="submit" disabled={loading}><Calendar className="mr-2 h-4 w-4" />Apply period</Button>
        </form>
        {rangeError && <p className="mt-3 text-sm text-red-700" role="alert">{rangeError}</p>}
        <p className="mt-3 text-xs text-gray-500">Comparisons use the immediately preceding period of the same length.</p>
      </CardContent>
    </Card>
    <ErrorNotice message={error} onRetry={() => load(appliedRange)} />
    {loading ? <div className="flex h-64 items-center justify-center text-gray-500" role="status">Loading dashboard...</div> : <>
      {data?.pendingCount > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950"><div><p className="text-sm font-semibold">{data.pendingCount} pending payment{data.pendingCount === 1 ? '' : 's'} need attention</p><p className="mt-0.5 text-xs text-amber-800">Check status before trying another payment.</p></div><Link to="/bank-payments" className="text-sm font-semibold hover:underline">Review pending payments →</Link></div>}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">{cards.map(([title, value, previousValue, Icon, money]) => { const change = percent(value, previousValue); return <Card key={title}><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-gray-600">{title}</CardTitle><Icon className="h-5 w-5 text-gray-400" /></CardHeader><CardContent><div className="text-2xl font-bold">{money ? formatCurrency(value, data?.currencyCode) : Number(value || 0).toLocaleString()}</div><div className="mt-2 flex items-center text-sm">{change === null ? null : change >= 0 ? <ArrowUpRight className="mr-1 h-4 w-4 text-green-500" /> : <ArrowDownRight className="mr-1 h-4 w-4 text-red-500" />}<span className={change === undefined ? 'text-gray-500' : change === null || change >= 0 ? 'text-green-600' : 'text-red-600'}>{change === null ? 'New' : change === undefined ? 'N/A' : `${change > 0 ? '+' : ''}${change.toFixed(2)}%`}</span><span className="ml-2 text-gray-500">vs previous period</span></div></CardContent></Card> })}</div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Recent transactions</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data?.recentTransactions?.length ? data.recentTransactions.map((tx) => <Link key={tx.transactionId} to={`/transactions/${encodeURIComponent(tx.transactionId)}`} className="flex items-center justify-between rounded-md py-2 hover:bg-gray-50"><div><p className="text-sm font-medium">{tx.transactionId}</p><p className="text-xs text-gray-500">{tx.customerName || 'Guest'} – {tx.transactionType}</p></div><div className="text-right"><p className="text-sm font-medium">{formatCurrency(tx.netAmount, tx.currencyCode)}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getStatusClasses(tx.status)}`}>{getStatusLabel(tx.status)}</span></div></Link>) : <p className="text-sm text-gray-500">No recent transactions</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Payment methods</CardTitle>
              <p className="mt-1 text-sm text-gray-500">Collected payment volume by method</p>
            </div>
            {paymentMethods.length > 0 && <div className="text-right"><p className="text-xs text-gray-500">Total volume</p><p className="text-sm font-semibold tabular-nums text-gray-900">{formatCurrency(paymentMethodTotal)}</p></div>}
          </CardHeader>
          <CardContent>
            {paymentMethods.length ? <ul className="space-y-5">
              {[...paymentMethods].reverse().map((row, index) => {
                const amount = Math.max(0, Number(row.totalAmount) || 0)
                const suppliedShare = Number(row.percentage)
                const share = Number.isFinite(suppliedShare) ? suppliedShare : paymentMethodTotal ? amount / paymentMethodTotal * 100 : 0
                const count = Number(row.transactionCount)
                const MethodIcon = getPaymentMethodIcon(row.paymentMethod)
                const colors = PAYMENT_METHOD_COLORS[index % PAYMENT_METHOD_COLORS.length]
                return <li key={row.paymentMethod || index}>
                  <div className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colors.icon}`}><MethodIcon className="h-5 w-5" aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="truncate text-sm font-semibold text-gray-900">{formatPaymentMethod(row.paymentMethod)}</span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">{formatCurrency(row.totalAmount)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label={`${formatPaymentMethod(row.paymentMethod)} share of payment volume`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.min(100, Math.max(0, share))}>
                          <div className={`h-full rounded-full transition-[width] duration-500 ${colors.bar}`} style={{ width: `${Math.min(100, Math.max(0, share))}%` }} />
                        </div>
                        <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-gray-500">{share > 0 && share < 0.1 ? '<0.1%' : `${share.toFixed(1)}%`}</span>
                      </div>
                      {Number.isFinite(count) && <p className="mt-1 text-xs text-gray-500">{count.toLocaleString()} {count === 1 ? 'transaction' : 'transactions'}</p>}
                    </div>
                  </div>
                </li>
              })}
            </ul> : <div className="flex min-h-32 flex-col items-center justify-center text-center"><Wallet className="mb-2 h-8 w-8 text-gray-300" aria-hidden="true" /><p className="text-sm font-medium text-gray-700">No payment activity yet</p><p className="mt-1 text-xs text-gray-500">Payment method totals will appear here.</p></div>}
          </CardContent>
        </Card>
      </div>
    </>}
  </div>
}