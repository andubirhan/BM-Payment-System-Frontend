import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, PackageSearch, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import ErrorNotice from '@/components/ErrorNotice'
import { itemReportsAPI } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency } from '@/lib/format'

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function Metric({ label, value, currency = false }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums text-gray-900">
        {currency ? formatCurrency(value) : new Intl.NumberFormat().format(value)}
      </p>
    </div>
  )
}

export default function ItemReport() {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const loadReport = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const response = await itemReportsAPI.get()
      setItems(Array.isArray(response.data) ? response.data : response.data?.content || [])
    } catch (error) {
      setItems([])
      setLoadError(getApiErrorMessage(error, 'Unable to load the item report.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return items
    return items.filter((item) => (
      String(item.itemCode || '').toLowerCase().includes(query)
        || String(item.itemName || '').toLowerCase().includes(query)
    ))
  }, [items, search])

  const totals = useMemo(() => items.reduce((summary, item) => ({
    stock: summary.stock + (Number(item.currentQuantityOnHand) || 0),
    salesQuantity: summary.salesQuantity + (Number(item.saleQuantity) || 0),
    purchaseQuantity: summary.purchaseQuantity + (Number(item.purchaseQuantity) || 0),
    salesAmount: summary.salesAmount + (Number(item.saleAmount) || 0),
    purchaseAmount: summary.purchaseAmount + (Number(item.purchaseAmount) || 0),
  }), { stock: 0, salesQuantity: 0, purchaseQuantity: 0, salesAmount: 0, purchaseAmount: 0 }), [items])

  const exportReport = () => {
    const rows = [
      ['Item code', 'Item name', 'Current stock', 'Units sold', 'Sales value', 'Units purchased', 'Purchase value', 'Sale transactions', 'Purchase transactions'],
      ...visibleItems.map((item) => [
        item.itemCode,
        item.itemName,
        item.currentQuantityOnHand,
        item.saleQuantity,
        item.saleAmount,
        item.purchaseQuantity,
        item.purchaseAmount,
        item.saleTransactionCount,
        item.purchaseTransactionCount,
      ]),
    ]
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'pos-item-report.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Item report</h1>
          <p className="mt-1 text-gray-500">Cumulative item movement from successful sales and purchases.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={loadReport} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />Refresh
          </Button>
          <Button type="button" variant="outline" onClick={exportReport} disabled={loading || visibleItems.length === 0}>
            <Download className="mr-2 h-4 w-4" />Export CSV
          </Button>
        </div>
      </div>

      <ErrorNotice message={loadError} onRetry={loadReport} />

      <section aria-label="Item totals" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Items tracked" value={items.length} />
        <Metric label="Current stock units" value={totals.stock} />
        <Metric label="Units sold" value={totals.salesQuantity} />
        <Metric label="Sales value" value={totals.salesAmount} currency />
        <Metric label="Units purchased" value={totals.purchaseQuantity} />
        <Metric label="Purchase value" value={totals.purchaseAmount} currency />
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Item movement</CardTitle>
              <p className="mt-1 text-sm text-gray-500">Quantities and line net amounts are aggregated by item code.</p>
            </div>
            <div className="relative w-full sm:w-72">
              <PackageSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item name or code" className="pl-9" aria-label="Search items" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-14 text-center text-sm text-gray-500" role="status">Loading item report…</div>
          ) : visibleItems.length === 0 ? (
            <div className="py-14 text-center">
              <p className="font-medium text-gray-800">{items.length ? 'No matching items' : 'No item activity yet'}</p>
              <p className="mt-1 text-sm text-gray-500">Completed sale and purchase transactions will appear here.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Sales value</TableHead>
                  <TableHead className="text-right">Purchased</TableHead>
                  <TableHead className="text-right">Purchase value</TableHead>
                  <TableHead className="text-right">Transactions (sale / purchase)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleItems.map((item) => (
                  <TableRow key={item.itemCode}>
                    <TableCell>
                      <p className="font-medium text-gray-900">{item.itemName}</p>
                      <p className="text-xs text-gray-500">{item.itemCode}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Number(item.currentQuantityOnHand) || 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(item.saleQuantity) || 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(item.saleAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(item.purchaseQuantity) || 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(item.purchaseAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(item.saleTransactionCount) || 0} / {Number(item.purchaseTransactionCount) || 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
