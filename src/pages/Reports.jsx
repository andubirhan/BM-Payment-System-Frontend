import { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar, Download } from 'lucide-react'
import { reportsAPI } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency } from '@/lib/format'
import ErrorNotice from '@/components/ErrorNotice'
import { format, startOfMonth } from 'date-fns'

const ReportsCharts = lazy(() => import('./ReportsCharts'))
const METRIC_ACCENTS = ['border-t-blue-500', 'border-t-emerald-500', 'border-t-amber-500', 'border-t-cyan-600', 'border-t-rose-500']
const initialRange = {
  from: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  to: format(new Date(), 'yyyy-MM-dd'),
}

function toList(value) {
  if (Array.isArray(value)) return value
  return Array.isArray(value?.content) ? value.content : []
}

function getRevenueMetrics(revenue) {
  if (!revenue) return []
  return [
    ['Revenue', revenue.revenue],
    ['Net revenue', revenue.netRevenue],
    ['VAT', revenue.vatAmount],
    ['Service fees', revenue.serviceFees],
    ['Refunds', revenue.refunds],
  ].filter(([, value]) => value !== null && value !== undefined)
}

function getGrossNetMetrics(report) {
  if (!report) return []
  return [
    ['Gross amount', report.grossAmount],
    ['Net amount', report.netAmount],
    ['VAT', report.vatAmount],
    ['Service fees', report.serviceFeeAmount ?? report.serviceFees],
  ].filter(([, value]) => value !== null && value !== undefined)
}

function withPaymentMethodPercentages(rows) {
  const normalized = rows.map((row) => {
    const totalAmount = Number(row.totalAmount ?? row.amount ?? row.revenue) || 0
    return {
      ...row,
      paymentMethod: row.paymentMethod || row.name || 'Unknown',
      totalAmount,
      chartAmount: Math.max(0, totalAmount),
    }
  })
  const chartTotal = normalized.reduce((total, row) => total + row.chartAmount, 0)

  return normalized.map((row) => ({
    ...row,
    percentage: chartTotal ? row.chartAmount / chartTotal * 100 : 0,
  }))
}

function formatPercentage(value) {
  const percentage = Number(value) || 0
  return percentage > 0 && percentage < 0.05 ? '<0.1%' : `${percentage.toFixed(1)}%`
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

export default function Reports() {
  const [dateRange, setDateRange] = useState(initialRange)
  const [appliedRange, setAppliedRange] = useState(initialRange)
  const [reportData, setReportData] = useState({ revenue: null, grossVsNet: null, vat: [], paymentMethods: [], cashierPerformance: [] })
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [rangeError, setRangeError] = useState('')
  const requestId = useRef(0)
  const requestController = useRef(null)

  const loadReports = useCallback(async (range) => {
    if (!range.from || !range.to || range.from > range.to) return
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    const currentRequestId = ++requestId.current
    setLoading(true)
    setLoadError('')
    try {
      const dateFrom = `${range.from}T00:00:00`
      const dateTo = `${range.to}T23:59:59`
      const [revenue, paymentMethods, cashierPerf] = await Promise.all([
        reportsAPI.revenue(dateFrom, dateTo, controller.signal),
        reportsAPI.paymentMethodBreakdown(dateFrom, dateTo, controller.signal),
        reportsAPI.cashierPerformance(dateFrom, dateTo, controller.signal),
      ])
      if (currentRequestId !== requestId.current) return
      setReportData({
        revenue: revenue.data || null,
        grossVsNet: revenue.data || null,
        vat: toList(revenue.data?.vatBreakdown),
        paymentMethods: withPaymentMethodPercentages(toList(paymentMethods.data)),
        cashierPerformance: toList(cashierPerf.data),
      })
    } catch (error) {
      if (currentRequestId !== requestId.current) return
      if (controller.signal.aborted || error.code === 'ERR_CANCELED') return
      setReportData({ revenue: null, grossVsNet: null, vat: [], paymentMethods: [], cashierPerformance: [] })
      setLoadError(getApiErrorMessage(error, 'Unable to load reports.'))
    } finally {
      if (currentRequestId === requestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReports(appliedRange)
    return () => {
      requestId.current += 1
      requestController.current?.abort()
    }
  }, [loadReports, appliedRange])

  const applyRange = () => {
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

  const exportReport = () => {
    const revenueRows = [
      ...getRevenueMetrics(reportData.revenue).map(([label, amount]) => ['Revenue summary', label, amount, '']),
      ...toList(reportData.revenue?.dailyBreakdown).map((row) => ['Revenue by day', row.date, row.totalRevenue, row.totalVat]),
      ...getGrossNetMetrics(reportData.grossVsNet).map(([label, amount]) => ['Gross vs net', label, amount, '']),
    ]
    const rows = [
      ['Section', 'Date or name', 'Amount', 'Additional value'],
      ...revenueRows,
      ...reportData.vat.map((row) => ['VAT', row.vatCategory || row.category || row.date, row.vatAmount ?? row.totalVat ?? row.amount, '']),
      ...reportData.paymentMethods.map((row) => ['Payment method', row.paymentMethod || row.name, row.totalAmount, row.percentage]),
      ...reportData.cashierPerformance.map((row) => ['Cashier', row.cashierId || row.name, row.totalRevenue, row.transactionCount]),
    ]
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `pos-report-${appliedRange.from}-to-${appliedRange.to}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const revenueMetrics = getRevenueMetrics(reportData.revenue)
  const grossNetMetrics = getGrossNetMetrics(reportData.grossVsNet)
  const dailyRevenue = toList(reportData.revenue?.dailyBreakdown)
  const hasGrossNetChartData = reportData.grossVsNet?.grossAmount !== null
    && reportData.grossVsNet?.grossAmount !== undefined
    && reportData.grossVsNet?.netAmount !== null
    && reportData.grossVsNet?.netAmount !== undefined
  const hasReportRows = revenueMetrics.length + grossNetMetrics.length + dailyRevenue.length + reportData.paymentMethods.length + reportData.cashierPerformance.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-3xl font-bold text-gray-900">Reports</h1><p className="mt-1 text-gray-500">Sales, VAT, payment method, and cashier summaries.</p></div>
        <Button variant="outline" onClick={exportReport} disabled={loading || !hasReportRows}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
      </div>

      <ErrorNotice message={loadError} onRetry={() => loadReports(appliedRange)} />

      <Card>
        <CardContent className="pt-6">
          <form className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); applyRange() }}>
            <div><label htmlFor="report-from" className="mb-1 block text-sm font-medium text-gray-700">From</label><Input id="report-from" type="date" value={dateRange.from} onChange={(event) => setDateRange((range) => ({ ...range, from: event.target.value }))} /></div>
            <div><label htmlFor="report-to" className="mb-1 block text-sm font-medium text-gray-700">To</label><Input id="report-to" type="date" value={dateRange.to} onChange={(event) => setDateRange((range) => ({ ...range, to: event.target.value }))} /></div>
            <Button type="submit" disabled={loading}><Calendar className="mr-2 h-4 w-4" />Apply period</Button>
          </form>
          {rangeError && <p className="mt-3 text-sm text-red-700" role="alert">{rangeError}</p>}
          <p className="mt-3 text-xs text-gray-500">Showing {appliedRange.from} through {appliedRange.to}</p>
        </CardContent>
      </Card>

      {!loading && revenueMetrics.length > 0 && <section aria-label="Revenue totals" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {revenueMetrics.map(([label, value], index) => <div key={label} className={`rounded-lg border border-gray-200 border-t-2 bg-white p-4 shadow-sm ${METRIC_ACCENTS[index % METRIC_ACCENTS.length]}`}>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-2 break-words text-xl font-semibold tabular-nums text-gray-900">{formatCurrency(value)}</p>
          <p className="mt-1 text-xs text-gray-400">{appliedRange.from} to {appliedRange.to}</p>
        </div>)}
      </section>}

      {loading ? <div className="flex h-64 items-center justify-center text-gray-500" role="status">Loading reports…</div> : !hasReportRows ? (
        <Card><CardContent className="py-16 text-center"><p className="font-medium text-gray-800">No report data for this period</p><p className="mt-1 text-sm text-gray-500">Choose a different date range or check back after transactions are recorded.</p></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Suspense fallback={<div className="col-span-full flex h-64 items-center justify-center text-gray-500" role="status">Loading report charts…</div>}>
            <ReportsCharts
              dailyRevenue={dailyRevenue}
              grossVsNet={reportData.grossVsNet}
              grossNetMetrics={grossNetMetrics}
              hasGrossNetChartData={hasGrossNetChartData}
              paymentMethods={reportData.paymentMethods}
              cashierPerformance={reportData.cashierPerformance}
            />
          </Suspense>
        </div>
      )}
    </div>
  )
}
