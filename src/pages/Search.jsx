import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search as SearchIcon, Filter, X } from 'lucide-react'
import { searchAPI } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/apiError'
import ErrorNotice from '@/components/ErrorNotice'
import { format } from 'date-fns'
import { Link, useSearchParams } from 'react-router-dom'
import { formatCurrency, getStatusClasses, getStatusLabel } from '@/lib/format'

const clearButtonPositions = {
  input: 'right-2',
  select: 'right-8',
  date: 'right-9',
}

const filterKeys = ['customerName', 'befaPaymentId', 'bankTransactionId', 'customerTin', 'status', 'transactionType', 'cashRegisterId', 'cashierId', 'dateFrom', 'dateTo']
const emptyFilters = Object.fromEntries(filterKeys.map((key) => [key, '']))

function filtersFromParams(params) {
  return Object.fromEntries(filterKeys.map((key) => [key, params.get(key) || '']))
}

function ClearableFilter({ value, label, onClear, placement = 'input', children }) {
  return (
    <div className="relative">
      {children}
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${label}`}
          title={`Clear ${label}`}
          className={`absolute ${clearButtonPositions[placement]} top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchKey = searchParams.toString()
  const currentPage = Math.max(0, Number(searchParams.get('page')) || 0)
  const appliedFilters = filtersFromParams(searchParams)
  const hasAppliedFilters = filterKeys.some((key) => appliedFilters[key])
  const [filters, setFilters] = useState(() => filtersFromParams(searchParams))
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [requestError, setRequestError] = useState('')
  const [rangeError, setRangeError] = useState('')
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const requestId = useRef(0)

  const updateFilter = (name, value) => {
    setFilters((currentFilters) => ({ ...currentFilters, [name]: value }))
  }

  useEffect(() => {
    const currentRequestId = ++requestId.current
    const params = new URLSearchParams(searchKey)
    const page = Math.max(0, Number(params.get('page')) || 0)
    const applied = filtersFromParams(params)
    const hasFilters = filterKeys.some((key) => applied[key])
    setLoading(true)
    setRequestError('')
    setFilters(applied)

    const request = hasFilters
      ? searchAPI.transactions({ ...applied, page, size: 20 })
      : searchAPI.recent(page, 20)
    request.then((response) => {
      if (currentRequestId !== requestId.current) return
      const data = response.data
      const records = Array.isArray(data) ? data : data?.content || []
      setResults(records)
      setTotalPages(Array.isArray(data) ? (records.length ? 1 : 0) : data?.totalPages || 0)
      setTotalElements(Array.isArray(data) ? records.length : data?.totalElements ?? records.length)
    }).catch((error) => {
      if (currentRequestId !== requestId.current) return
      setResults([])
      setTotalPages(0)
      setTotalElements(0)
      setRequestError(error.status === 404 ? '' : getApiErrorMessage(error, 'Unable to load transactions.'))
    }).finally(() => {
      if (currentRequestId === requestId.current) setLoading(false)
    })

    return () => {
      requestId.current += 1
    }
  }, [searchKey, refreshVersion])

  const handleSearch = (e) => {
    e.preventDefault()
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      setRangeError('The start date must be on or before the end date.')
      return
    }
    setRangeError('')
    const next = new URLSearchParams()
    for (const key of filterKeys) if (filters[key]) next.set(key, filters[key])
    setSearchParams(next)
  }

  const handleReset = () => {
    setFilters(emptyFilters)
    setRangeError('')
    setSearchParams({})
  }

  const setPageInUrl = (page) => {
    const next = new URLSearchParams(searchParams)
    if (page > 0) next.set('page', String(page))
    else next.delete('page')
    setSearchParams(next)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Search Transactions</h1>
        <p className="text-gray-500 mt-1">Find transactions using various filters</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Search Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label htmlFor="search-customer-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Customer Name
                </label>
                <ClearableFilter
                  value={filters.customerName}
                  label="customer name"
                  onClear={() => updateFilter('customerName', '')}
                >
                  <Input
                    id="search-customer-name"
                    placeholder="Enter customer name"
                    value={filters.customerName}
                    onChange={(e) => updateFilter('customerName', e.target.value)}
                    className="pr-10"
                  />
                </ClearableFilter>
              </div>
              <div>
                <label htmlFor="search-befa-payment-id" className="block text-sm font-medium text-gray-700 mb-1">
                  BEFA Payment ID
                </label>
                <ClearableFilter
                  value={filters.befaPaymentId}
                  label="BEFA payment ID"
                  onClear={() => updateFilter('befaPaymentId', '')}
                >
                  <Input
                    id="search-befa-payment-id"
                    placeholder="Enter BEFA payment ID"
                    value={filters.befaPaymentId}
                    onChange={(e) => updateFilter('befaPaymentId', e.target.value)}
                    className="pr-10"
                  />
                </ClearableFilter>
              </div>
              <div>
                <label htmlFor="search-bank-payment-id" className="block text-sm font-medium text-gray-700 mb-1">
                  Bank Payment ID
                </label>
                <ClearableFilter
                  value={filters.bankTransactionId}
                  label="bank payment ID"
                  onClear={() => updateFilter('bankTransactionId', '')}
                >
                  <Input
                    id="search-bank-payment-id"
                    placeholder="Enter bank payment ID"
                    value={filters.bankTransactionId}
                    onChange={(e) => updateFilter('bankTransactionId', e.target.value)}
                    className="pr-10"
                  />
                </ClearableFilter>
              </div>
              <div>
                <label htmlFor="search-customer-tin" className="block text-sm font-medium text-gray-700 mb-1">
                  Customer TIN
                </label>
                <ClearableFilter
                  value={filters.customerTin}
                  label="customer TIN"
                  onClear={() => updateFilter('customerTin', '')}
                >
                  <Input
                    id="search-customer-tin"
                    placeholder="Enter TIN"
                    value={filters.customerTin}
                    onChange={(e) => updateFilter('customerTin', e.target.value)}
                    className="pr-10"
                  />
                </ClearableFilter>
              </div>
              <div>
                <label htmlFor="search-status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <ClearableFilter
                  value={filters.status}
                  label="status"
                  onClear={() => updateFilter('status', '')}
                  placement="select"
                >
                  <select
                    id="search-status"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-16 text-sm"
                    value={filters.status}
                    onChange={(e) => updateFilter('status', e.target.value)}
                  >
                    <option value="">All Statuses</option>
                    <option value="SETTLED">Settled</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="PENDING">Pending</option>
                    <option value="PARTIALLY_CAPTURED">Partially captured</option>
                    <option value="FAILED">Failed</option>
                    <option value="PARTIALLY_REFUNDED">Partially refunded</option>
                    <option value="REFUNDED">Refunded</option>
                  </select>
                </ClearableFilter>
              </div>
              <div>
                <label htmlFor="search-transaction-type" className="block text-sm font-medium text-gray-700 mb-1">
                  Transaction Type
                </label>
                <ClearableFilter
                  value={filters.transactionType}
                  label="transaction type"
                  onClear={() => updateFilter('transactionType', '')}
                  placement="select"
                >
                  <select
                    id="search-transaction-type"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-16 text-sm"
                    value={filters.transactionType}
                    onChange={(e) => updateFilter('transactionType', e.target.value)}
                  >
                    <option value="">All Types</option>
                    <option value="PURCHASE">Purchase</option>
                    <option value="PRE_AUTH">Pre-Auth</option>
                    <option value="REFUND">Refund</option>
                    <option value="REVERSAL">Reversal</option>
                  </select>
                </ClearableFilter>
              </div>
              <div>
                <label htmlFor="search-register" className="block text-sm font-medium text-gray-700 mb-1">
                  Cash Register ID
                </label>
                <ClearableFilter
                  value={filters.cashRegisterId}
                  label="cash register ID"
                  onClear={() => updateFilter('cashRegisterId', '')}
                >
                  <Input
                    id="search-register"
                    placeholder="Enter register ID"
                    value={filters.cashRegisterId}
                    onChange={(e) => updateFilter('cashRegisterId', e.target.value)}
                    className="pr-10"
                  />
                </ClearableFilter>
              </div>
              <div>
                <label htmlFor="search-date-from" className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
                <ClearableFilter
                  value={filters.dateFrom}
                  label="start date"
                  onClear={() => updateFilter('dateFrom', '')}
                  placement="date"
                >
                  <Input
                    id="search-date-from"
                    type="datetime-local"
                    value={filters.dateFrom}
                    onChange={(e) => updateFilter('dateFrom', e.target.value)}
                    className="pr-16"
                  />
                </ClearableFilter>
              </div>
              <div>
                <label htmlFor="search-date-to" className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
                <ClearableFilter
                  value={filters.dateTo}
                  label="end date"
                  onClear={() => updateFilter('dateTo', '')}
                  placement="date"
                >
                  <Input
                    id="search-date-to"
                    type="datetime-local"
                    value={filters.dateTo}
                    onChange={(e) => updateFilter('dateTo', e.target.value)}
                    className="pr-16"
                  />
                </ClearableFilter>
              </div>
              <div>
                <label htmlFor="search-cashier" className="block text-sm font-medium text-gray-700 mb-1">
                  Cashier ID
                </label>
                <ClearableFilter
                  value={filters.cashierId}
                  label="cashier ID"
                  onClear={() => updateFilter('cashierId', '')}
                >
                  <Input
                    id="search-cashier"
                    placeholder="Enter cashier ID"
                    value={filters.cashierId}
                    onChange={(e) => updateFilter('cashierId', e.target.value)}
                    className="pr-10"
                  />
                </ClearableFilter>
              </div>
            </div>

            {rangeError && <p className="text-sm text-red-700" role="alert">{rangeError}</p>}

            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                <SearchIcon className="h-4 w-4 mr-2" />
                Search
              </Button>
              <Button type="button" variant="outline" onClick={handleReset}>
                Reset
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
          <CardHeader>
            <CardTitle>
              {hasAppliedFilters ? `Search Results (${totalElements})` : 'Recent Transactions'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ErrorNotice message={requestError} onRetry={() => setRefreshVersion((version) => version + 1)} />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500">
                      Loading transactions...
                    </TableCell>
                  </TableRow>
                ) : requestError ? null : results.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500">
                      {hasAppliedFilters ? 'No transactions match these filters' : 'No recent transactions'}
                    </TableCell>
                  </TableRow>
                ) : results.map((tx) => (
                  <TableRow key={tx.transactionId}>
                    <TableCell className="font-medium"><Link className="text-blue-700 hover:text-blue-900" to={`/transactions/${encodeURIComponent(tx.transactionId)}`}>{tx.transactionId}</Link></TableCell>
                    <TableCell>{tx.transactionType}</TableCell>
                    <TableCell>{tx.customerName || 'Guest'}</TableCell>
                    <TableCell>{formatCurrency(tx.netAmount, tx.currencyCode)}</TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(tx.status)}`}>
                        {getStatusLabel(tx.status)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {tx.createdAt ? format(new Date(tx.createdAt), 'MMM dd, yyyy HH:mm') : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {totalPages > 1 && <div className="mt-4 flex items-center justify-between"><p className="text-sm text-gray-500">Page {currentPage + 1} of {totalPages}</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setPageInUrl(currentPage - 1)} disabled={currentPage === 0 || loading}>Previous</Button><Button type="button" variant="outline" size="sm" onClick={() => setPageInUrl(currentPage + 1)} disabled={currentPage >= totalPages - 1 || loading}>Next</Button></div></div>}
          </CardContent>
      </Card>
    </div>
  )
}
