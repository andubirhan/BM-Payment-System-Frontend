import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, FileText, Maximize2, Minimize2, X } from 'lucide-react'
import { format, startOfMonth } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import ErrorNotice from '@/components/ErrorNotice'
import { reportsAPI } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency } from '@/lib/format'

function currentMonthRange() {
  const today = new Date()
  return {
    from: format(startOfMonth(today), 'yyyy-MM-dd'),
    to: format(today, 'yyyy-MM-dd'),
  }
}

function transactionLabel(type) {
  return {
    SALE: 'Sales',
    PURCHASE: 'Purchases',
    REFUND: 'Refunds',
    REVERSAL: 'Reversals',
  }[type] || type
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function Metric({ label, amount, supportingText }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tabular-nums text-gray-900">{formatCurrency(amount)}</p>
        {supportingText && <p className="mt-1 text-xs text-gray-500">{supportingText}</p>}
      </CardContent>
    </Card>
  )
}

export default function FinancialReport() {
  const [dateRange, setDateRange] = useState(currentMonthRange)
  const [appliedRange, setAppliedRange] = useState(currentMonthRange)
  const [transactions, setTransactions] = useState([])
  const [analysis, setAnalysis] = useState(null)
  const [dailyActivity, setDailyActivity] = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [itemActivity, setItemActivity] = useState([])
  const [operatorActivity, setOperatorActivity] = useState([])
  const [outstandingActivity, setOutstandingActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [rangeError, setRangeError] = useState('')
  const [zoomedPanel, setZoomedPanel] = useState(null)

  const loadReport = useCallback(async (range) => {
    setLoading(true)
    setLoadError('')
    try {
      const response = await reportsAPI.financialAudit(
        `${range.from}T00:00:00`,
        `${range.to}T23:59:59`,
      )
      const data = response.data?.body ?? response.data?.data ?? response.data
      setTransactions(Array.isArray(data?.transactions) ? data.transactions : [])
      setAnalysis(data?.analysis || null)
      setDailyActivity(Array.isArray(data?.dailyActivity) ? data.dailyActivity : [])
      setPaymentMethods(Array.isArray(data?.paymentMethods) ? data.paymentMethods : [])
      setItemActivity(Array.isArray(data?.itemActivity) ? data.itemActivity : [])
      setOperatorActivity(Array.isArray(data?.operatorActivity) ? data.operatorActivity : [])
      setOutstandingActivity(Array.isArray(data?.outstandingActivity) ? data.outstandingActivity : [])
    } catch (error) {
      setTransactions([])
      setAnalysis(null)
      setDailyActivity([])
      setPaymentMethods([])
      setItemActivity([])
      setOperatorActivity([])
      setOutstandingActivity([])
      setLoadError(getApiErrorMessage(error, 'Unable to load the financial audit report.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReport(appliedRange)
  }, [appliedRange, loadReport])

  const totalsByType = useMemo(() => {
    const totals = new Map()
    for (const row of transactions) {
      totals.set(String(row.transactionType || '').toUpperCase(), row)
    }
    return totals
  }, [transactions])

  const metrics = [
    {
      label: 'Sales after refunds/reversals',
      amount: analysis?.netSalesAfterAdjustments ?? totalsByType.get('SALE')?.netAmount,
      supportingText: 'Recorded sales minus linked refunds and reversals',
    },
    {
      label: 'Purchases after refunds/reversals',
      amount: analysis?.netPurchasesAfterAdjustments ?? totalsByType.get('PURCHASE')?.netAmount,
      supportingText: 'Recorded purchases minus linked refunds and reversals',
    },
    {
      label: 'Sales VAT after refunds/reversals',
      amount: analysis?.salesVatRecordedAfterAdjustments ?? totalsByType.get('SALE')?.vatAmount,
      supportingText: 'Recorded sales VAT minus linked refund/reversal VAT',
    },
    {
      label: 'Purchase VAT after refunds/reversals',
      amount: analysis?.purchasesVatRecordedAfterAdjustments ?? totalsByType.get('PURCHASE')?.vatAmount,
      supportingText: 'Recorded purchase VAT minus linked corrections; recoverability is not assessed',
    },
    {
      label: 'Service fees after reversals',
      amount: analysis?.serviceFeesAfterReversals ?? transactions.reduce((sum, row) => sum + (Number(row.serviceFeeAmount) || 0), 0),
      supportingText: 'Recorded sale/purchase fees less reversed fees',
    },
    {
      label: 'Refunds',
      amount: analysis?.refundAmount ?? totalsByType.get('REFUND')?.netAmount,
      supportingText: `${Number(totalsByType.get('REFUND')?.transactionCount) || 0} recorded refund transactions`,
    },
    {
      label: 'Reversals',
      amount: analysis?.reversalAmount ?? totalsByType.get('REVERSAL')?.netAmount,
      supportingText: `${Number(totalsByType.get('REVERSAL')?.transactionCount) || 0} recorded reversal transactions`,
    },
    ...(analysis?.salesPaymentVariance !== undefined ? [{
      label: 'Sales payment variance',
      amount: analysis.salesPaymentVariance,
      supportingText: `Paid ${formatCurrency(analysis.salesAmountPaid)} against recorded ${formatCurrency(analysis.salesAmountDue)}`,
    }] : []),
    ...(analysis?.purchasesPaymentVariance !== undefined ? [{
      label: 'Purchase payment variance',
      amount: analysis.purchasesPaymentVariance,
      supportingText: `Paid ${formatCurrency(analysis.purchasesAmountPaid)} against recorded ${formatCurrency(analysis.purchasesAmountDue)}`,
    }] : []),
  ]

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

  const exportReport = () => {
    const rows = [
      ['Transaction type', 'Transactions', 'Gross amount', 'VAT recorded', 'Service fees', 'Net amount', 'Amount paid'],
      ...transactions.map((row) => [
        transactionLabel(String(row.transactionType || '').toUpperCase()),
        row.transactionCount,
        row.grossAmount,
        row.vatAmount,
        row.serviceFeeAmount,
        row.netAmount,
        row.totalAmountPaid,
      ]),
      [],
      ['Analysis', 'Amount'],
      ['Sales after linked refunds/reversals', analysis?.netSalesAfterAdjustments],
      ['Purchases after linked refunds/reversals', analysis?.netPurchasesAfterAdjustments],
      ['Sales VAT after linked refunds/reversals', analysis?.salesVatRecordedAfterAdjustments],
      ['Purchase VAT after linked refunds/reversals', analysis?.purchasesVatRecordedAfterAdjustments],
      ['Service fees after reversals', analysis?.serviceFeesAfterReversals],
      ['Sales payment variance', analysis?.salesPaymentVariance],
      ['Purchase payment variance', analysis?.purchasesPaymentVariance],
      [],
      ['Daily activity', 'Type', 'Count', 'Recorded net amount', 'Recorded VAT'],
      ...dailyActivity.map((row) => [row.date, transactionLabel(String(row.transactionType || '').toUpperCase()), row.transactionCount, row.netAmount, row.vatAmount]),
      [],
      ['Item activity', 'Sale quantity', 'Purchase quantity', 'Sale net amount', 'Purchase net amount'],
      ...itemActivity.map((row) => [row.itemName, row.saleQuantity, row.purchaseQuantity, row.saleNetAmount, row.purchaseNetAmount]),
      [],
      ['Unsettled activity', 'Status', 'Count', 'Net amount', 'Amount paid'],
      ...outstandingActivity.map((row) => [transactionLabel(String(row.transactionType || '').toUpperCase()), row.status, row.transactionCount, row.netAmount, row.amountPaid]),
      [],
      ['Payment methods', 'Tenders', 'Amount applied'],
      ...paymentMethods.map((row) => [row.paymentMethod, row.tenderCount, row.amountApplied]),
    ]
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `financial-audit-${appliedRange.from}-to-${appliedRange.to}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Financial report</h1>
          <p className="mt-1 text-gray-500">Sales, purchases, recorded VAT, service fees, refunds, and reversals.</p>
        </div>
        <Button type="button" variant="outline" onClick={exportReport} disabled={loading || transactions.length === 0}>
          <Download className="mr-2 h-4 w-4" />Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={applyDateRange}>
            <div>
              <label htmlFor="financial-report-from" className="mb-1 block text-sm font-medium text-gray-700">From</label>
              <Input id="financial-report-from" type="date" value={dateRange.from} onChange={(event) => setDateRange((range) => ({ ...range, from: event.target.value }))} />
            </div>
            <div>
              <label htmlFor="financial-report-to" className="mb-1 block text-sm font-medium text-gray-700">To</label>
              <Input id="financial-report-to" type="date" value={dateRange.to} onChange={(event) => setDateRange((range) => ({ ...range, to: event.target.value }))} />
            </div>
            <Button type="submit" disabled={loading}><FileText className="mr-2 h-4 w-4" />Apply period</Button>
          </form>
          {rangeError && <p className="mt-3 text-sm text-red-700" role="alert">{rangeError}</p>}
          <p className="mt-3 text-xs text-gray-500">Showing {appliedRange.from} through {appliedRange.to}. Transactions are grouped by settlement date, falling back to creation date when not settled.</p>
        </CardContent>
      </Card>

      <ErrorNotice message={loadError} onRetry={() => loadReport(appliedRange)} />

      {loading ? (
        <div className="flex h-48 items-center justify-center text-gray-500" role="status">Loading financial report…</div>
      ) : (
        <>
          <section aria-label="Financial totals" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {metrics.map((metric) => <Metric key={metric.label} {...metric} />)}
          </section>
          <p className="text-sm text-gray-600">
            “After refunds/reversals” means the report subtracts recorded refunds or reversals linked to a sale or purchase from that type’s total. Separate refund and reversal cards still show their recorded amounts. Unlinked adjustments cannot be assigned to a sale or purchase.
          </p>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Audit summary by transaction type</CardTitle>
                <p className="text-sm text-gray-500">The table shows recorded amounts by transaction type. The summary cards subtract refunds and reversals from their linked sale or purchase where the parent is available.</p>
              </div>
              <Button type="button" variant="outline" size="icon" onClick={() => setZoomedPanel(zoomedPanel === 'audit' ? null : 'audit')} title={zoomedPanel === 'audit' ? 'Minimize' : 'Zoom'}>
                {zoomedPanel === 'audit' ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="font-medium text-gray-800">No completed financial activity for this period</p>
                  <p className="mt-1 text-sm text-gray-500">Try another date range.</p>
                </div>
              ) : (
                <div className={`${zoomedPanel === 'audit' ? 'max-h-[70vh]' : 'max-h-80'} overflow-y-auto rounded-lg border border-gray-200`} style={{ scrollbarWidth: 'auto' }}>
                  <Table>
                    <TableHeader className="sticky top-0 bg-gray-50">
                      <TableRow>
                        <TableHead>Transaction type</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                        <TableHead className="text-right">Gross amount</TableHead>
                        <TableHead className="text-right">VAT recorded</TableHead>
                        <TableHead className="text-right">Service fees</TableHead>
                        <TableHead className="text-right">Net amount</TableHead>
                        <TableHead className="text-right">Amount paid</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((row) => (
                        <TableRow key={row.transactionType}>
                          <TableCell className="font-medium">{transactionLabel(String(row.transactionType || '').toUpperCase())}</TableCell>
                          <TableCell className="text-right tabular-nums">{Number(row.transactionCount) || 0}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(row.grossAmount)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(row.vatAmount)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(row.serviceFeeAmount)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(row.netAmount)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(row.totalAmountPaid)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          <section aria-label="Operational analysis" className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle>Daily activity</CardTitle>
                  <p className="text-sm text-gray-500">Recorded transaction values by settlement date; refunds and reversals are listed separately.</p>
                </div>
                <Button type="button" variant="outline" size="icon" onClick={() => setZoomedPanel(zoomedPanel === 'daily' ? null : 'daily')} title={zoomedPanel === 'daily' ? 'Minimize' : 'Zoom'}>
                  {zoomedPanel === 'daily' ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              </CardHeader>
              <CardContent>
                {dailyActivity.length === 0 ? <p className="py-6 text-center text-sm text-gray-500">No daily activity for this period.</p> : (
                  <div className={`${zoomedPanel === 'daily' ? 'max-h-[70vh]' : 'max-h-80'} overflow-y-auto rounded-lg border border-gray-200`} style={{ scrollbarWidth: 'auto' }}>
                    <Table>
                      <TableHeader className="sticky top-0 bg-gray-50"><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Net</TableHead><TableHead className="text-right">VAT</TableHead></TableRow></TableHeader>
                      <TableBody>{dailyActivity.map((row, index) => <TableRow key={`${row.date}-${row.transactionType}-${index}`}><TableCell>{row.date}</TableCell><TableCell>{transactionLabel(String(row.transactionType || '').toUpperCase())}</TableCell><TableCell className="text-right tabular-nums">{Number(row.transactionCount) || 0}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.netAmount)}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.vatAmount)}</TableCell></TableRow>)}</TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle>Item activity</CardTitle>
                  <p className="text-sm text-gray-500">Transaction line activity for the selected period. Quantities and net amounts are not adjusted for refunds or reversals.</p>
                </div>
                <Button type="button" variant="outline" size="icon" onClick={() => setZoomedPanel(zoomedPanel === 'item' ? null : 'item')} title={zoomedPanel === 'item' ? 'Minimize' : 'Zoom'}>
                  {zoomedPanel === 'item' ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              </CardHeader>
              <CardContent>
                {itemActivity.length === 0 ? <p className="py-6 text-center text-sm text-gray-500">No item lines for this period.</p> : (
                  <div className={`${zoomedPanel === 'item' ? 'max-h-[70vh]' : 'max-h-80'} overflow-y-auto rounded-lg border border-gray-200`} style={{ scrollbarWidth: 'auto' }}>
                    <Table>
                      <TableHeader className="sticky top-0 bg-gray-50"><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Sold qty.</TableHead><TableHead className="text-right">Purchased qty.</TableHead><TableHead className="text-right">Sale net</TableHead><TableHead className="text-right">Purchase net</TableHead></TableRow></TableHeader>
                      <TableBody>{itemActivity.map((row) => <TableRow key={row.itemCode}><TableCell><span className="block font-medium">{row.itemName}</span><span className="text-xs text-gray-500">{row.itemCode}</span></TableCell><TableCell className="text-right tabular-nums">{Number(row.saleQuantity) || 0}</TableCell><TableCell className="text-right tabular-nums">{Number(row.purchaseQuantity) || 0}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.saleNetAmount)}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.purchaseNetAmount)}</TableCell></TableRow>)}</TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle>Cashier and register activity</CardTitle>
                  <p className="text-sm text-gray-500">Operational totals by cashier, register, and transaction type; not a staff performance ranking.</p>
                </div>
                <Button type="button" variant="outline" size="icon" onClick={() => setZoomedPanel(zoomedPanel === 'operator' ? null : 'operator')} title={zoomedPanel === 'operator' ? 'Minimize' : 'Zoom'}>
                  {zoomedPanel === 'operator' ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              </CardHeader>
              <CardContent>
                {operatorActivity.length === 0 ? <p className="py-6 text-center text-sm text-gray-500">No cashier/register activity for this period.</p> : (
                  <div className={`${zoomedPanel === 'operator' ? 'max-h-[70vh]' : 'max-h-80'} overflow-y-auto rounded-lg border border-gray-200`} style={{ scrollbarWidth: 'auto' }}>
                    <Table>
                      <TableHeader className="sticky top-0 bg-gray-50"><TableRow><TableHead>Cashier</TableHead><TableHead>Register</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Net amount</TableHead></TableRow></TableHeader>
                      <TableBody>{operatorActivity.map((row, index) => <TableRow key={`${row.cashierId}-${row.cashRegisterId}-${row.transactionType}-${index}`}><TableCell>{row.cashierId}</TableCell><TableCell>{row.cashRegisterId}</TableCell><TableCell>{transactionLabel(String(row.transactionType || '').toUpperCase())}</TableCell><TableCell className="text-right tabular-nums">{Number(row.transactionCount) || 0}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.netAmount)}</TableCell></TableRow>)}</TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle>Outstanding activity</CardTitle>
                  <p className="text-sm text-gray-500">Pending and in-progress transactions recorded during the selected period; investigate these before closing the period.</p>
                </div>
                <Button type="button" variant="outline" size="icon" onClick={() => setZoomedPanel(zoomedPanel === 'outstanding' ? null : 'outstanding')} title={zoomedPanel === 'outstanding' ? 'Minimize' : 'Zoom'}>
                  {zoomedPanel === 'outstanding' ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              </CardHeader>
              <CardContent>
                {outstandingActivity.length === 0 ? <p className="py-6 text-center text-sm text-gray-500">No outstanding transaction activity for this period.</p> : (
                  <div className={`${zoomedPanel === 'outstanding' ? 'max-h-[70vh]' : 'max-h-80'} overflow-y-auto rounded-lg border border-gray-200`} style={{ scrollbarWidth: 'auto' }}>
                    <Table>
                      <TableHeader className="sticky top-0 bg-gray-50"><TableRow><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Net amount</TableHead><TableHead className="text-right">Amount paid</TableHead></TableRow></TableHeader>
                      <TableBody>{outstandingActivity.map((row, index) => <TableRow key={`${row.transactionType}-${row.status}-${index}`}><TableCell>{transactionLabel(String(row.transactionType || '').toUpperCase())}</TableCell><TableCell>{String(row.status || '').replaceAll('_', ' ')}</TableCell><TableCell className="text-right tabular-nums">{Number(row.transactionCount) || 0}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.netAmount)}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.amountPaid)}</TableCell></TableRow>)}</TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
          <p className="text-xs text-gray-500">
            This report summarizes values recorded by the POS for audit support. The payment variance compares recorded paid and net amounts for sales and purchases before refund payouts. VAT amounts are recorded values only: purchase VAT recoverability and tax liability are not determined here. Net sales less purchases is not profit.
          </p>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Payment method totals</CardTitle>
                <p className="text-sm text-gray-500">Applied tender amounts for completed or settled sales and purchases.</p>
              </div>
              <Button type="button" variant="outline" size="icon" onClick={() => setZoomedPanel(zoomedPanel === 'payment' ? null : 'payment')} title={zoomedPanel === 'payment' ? 'Minimize' : 'Zoom'}>
                {zoomedPanel === 'payment' ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </CardHeader>
            <CardContent>
              {paymentMethods.length === 0 ? <p className="py-6 text-center text-sm text-gray-500">No payment tenders for this period.</p> : (
                <div className={`${zoomedPanel === 'payment' ? 'max-h-[70vh]' : 'max-h-80'} overflow-y-auto rounded-lg border border-gray-200`} style={{ scrollbarWidth: 'auto' }}>
                  <Table>
                    <TableHeader className="sticky top-0 bg-gray-50"><TableRow><TableHead>Method</TableHead><TableHead className="text-right">Tenders</TableHead><TableHead className="text-right">Amount applied</TableHead></TableRow></TableHeader>
                    <TableBody>{paymentMethods.map((row) => <TableRow key={row.paymentMethod}><TableCell className="font-medium">{String(row.paymentMethod || '').replaceAll('_', ' ')}</TableCell><TableCell className="text-right tabular-nums">{Number(row.tenderCount) || 0}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.amountApplied)}</TableCell></TableRow>)}</TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {zoomedPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setZoomedPanel(null)}>
          <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-lg bg-white shadow-xl" style={{ scrollbarWidth: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white p-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {zoomedPanel === 'audit' && 'Audit summary by transaction type'}
                {zoomedPanel === 'daily' && 'Daily activity'}
                {zoomedPanel === 'item' && 'Item activity'}
                {zoomedPanel === 'operator' && 'Cashier and register activity'}
                {zoomedPanel === 'outstanding' && 'Outstanding activity'}
                {zoomedPanel === 'payment' && 'Payment method totals'}
              </h2>
              <Button type="button" variant="outline" size="icon" onClick={() => setZoomedPanel(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4">
              {zoomedPanel === 'audit' && (
                <Table>
                  <TableHeader className="sticky top-0 bg-gray-50">
                    <TableRow>
                      <TableHead>Transaction type</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Gross amount</TableHead>
                      <TableHead className="text-right">VAT recorded</TableHead>
                      <TableHead className="text-right">Service fees</TableHead>
                      <TableHead className="text-right">Net amount</TableHead>
                      <TableHead className="text-right">Amount paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((row) => (
                      <TableRow key={row.transactionType}>
                        <TableCell className="font-medium">{transactionLabel(String(row.transactionType || '').toUpperCase())}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(row.transactionCount) || 0}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(row.grossAmount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(row.vatAmount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(row.serviceFeeAmount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(row.netAmount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(row.totalAmountPaid)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {zoomedPanel === 'daily' && (
                <Table>
                  <TableHeader className="sticky top-0 bg-gray-50"><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Net</TableHead><TableHead className="text-right">VAT</TableHead></TableRow></TableHeader>
                  <TableBody>{dailyActivity.map((row, index) => <TableRow key={`${row.date}-${row.transactionType}-${index}`}><TableCell>{row.date}</TableCell><TableCell>{transactionLabel(String(row.transactionType || '').toUpperCase())}</TableCell><TableCell className="text-right tabular-nums">{Number(row.transactionCount) || 0}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.netAmount)}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.vatAmount)}</TableCell></TableRow>)}</TableBody>
                </Table>
              )}
              {zoomedPanel === 'item' && (
                <Table>
                  <TableHeader className="sticky top-0 bg-gray-50"><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Sold qty.</TableHead><TableHead className="text-right">Purchased qty.</TableHead><TableHead className="text-right">Sale net</TableHead><TableHead className="text-right">Purchase net</TableHead></TableRow></TableHeader>
                  <TableBody>{itemActivity.map((row) => <TableRow key={row.itemCode}><TableCell><span className="block font-medium">{row.itemName}</span><span className="text-xs text-gray-500">{row.itemCode}</span></TableCell><TableCell className="text-right tabular-nums">{Number(row.saleQuantity) || 0}</TableCell><TableCell className="text-right tabular-nums">{Number(row.purchaseQuantity) || 0}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.saleNetAmount)}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.purchaseNetAmount)}</TableCell></TableRow>)}</TableBody>
                </Table>
              )}
              {zoomedPanel === 'operator' && (
                <Table>
                  <TableHeader className="sticky top-0 bg-gray-50"><TableRow><TableHead>Cashier</TableHead><TableHead>Register</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Net amount</TableHead></TableRow></TableHeader>
                  <TableBody>{operatorActivity.map((row, index) => <TableRow key={`${row.cashierId}-${row.cashRegisterId}-${row.transactionType}-${index}`}><TableCell>{row.cashierId}</TableCell><TableCell>{row.cashRegisterId}</TableCell><TableCell>{transactionLabel(String(row.transactionType || '').toUpperCase())}</TableCell><TableCell className="text-right tabular-nums">{Number(row.transactionCount) || 0}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.netAmount)}</TableCell></TableRow>)}</TableBody>
                </Table>
              )}
              {zoomedPanel === 'outstanding' && (
                <Table>
                  <TableHeader className="sticky top-0 bg-gray-50"><TableRow><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Net amount</TableHead><TableHead className="text-right">Amount paid</TableHead></TableRow></TableHeader>
                  <TableBody>{outstandingActivity.map((row, index) => <TableRow key={`${row.transactionType}-${row.status}-${index}`}><TableCell>{transactionLabel(String(row.transactionType || '').toUpperCase())}</TableCell><TableCell>{String(row.status || '').replaceAll('_', ' ')}</TableCell><TableCell className="text-right tabular-nums">{Number(row.transactionCount) || 0}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.netAmount)}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.amountPaid)}</TableCell></TableRow>)}</TableBody>
                </Table>
              )}
              {zoomedPanel === 'payment' && (
                <Table>
                  <TableHeader className="sticky top-0 bg-gray-50"><TableRow><TableHead>Method</TableHead><TableHead className="text-right">Tenders</TableHead><TableHead className="text-right">Amount applied</TableHead></TableRow></TableHeader>
                  <TableBody>{paymentMethods.map((row) => <TableRow key={row.paymentMethod}><TableCell className="font-medium">{String(row.paymentMethod || '').replaceAll('_', ' ')}</TableCell><TableCell className="text-right tabular-nums">{Number(row.tenderCount) || 0}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.amountApplied)}</TableCell></TableRow>)}</TableBody>
                </Table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
