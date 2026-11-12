import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Download, FileCheck2, RefreshCw, Search } from 'lucide-react'
import { format, startOfMonth } from 'date-fns'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import ErrorNotice from '@/components/ErrorNotice'
import { reportsAPI } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency } from '@/lib/format'

const PAGE_SIZE = 20
const STATUS_STYLES = {
  ACCEPTED: 'bg-emerald-100 text-emerald-800',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  PENDING: 'bg-amber-100 text-amber-800',
  QUEUED: 'bg-violet-100 text-violet-800',
  REJECTED: 'bg-red-100 text-red-800',
  FAILED: 'bg-red-100 text-red-800',
}

function initialFilters() {
  const today = new Date()
  return {
    dateFrom: format(startOfMonth(today), 'yyyy-MM-dd'),
    dateTo: format(today, 'yyyy-MM-dd'),
    status: '',
    mode: '',
    creditNote: '',
    query: '',
  }
}

function dateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function StatusBadge({ status }) {
  const value = status || 'UNKNOWN'
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[value] || 'bg-gray-100 text-gray-700'}`}>
      {value.replaceAll('_', ' ')}
    </span>
  )
}

function Metric({ label, value, detail }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tabular-nums text-gray-900">{value}</p>
        <p className="mt-1 text-xs text-gray-500">{detail}</p>
      </CardContent>
    </Card>
  )
}

export default function FiscalReports() {
  const [filters, setFilters] = useState(initialFilters)
  const [appliedFilters, setAppliedFilters] = useState(initialFilters)
  const [page, setPage] = useState(0)
  const [report, setReport] = useState({ content: [], totalElements: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const loadReport = useCallback(async (criteria, currentPage) => {
    setLoading(true)
    setLoadError('')
    try {
      const params = {
        page: currentPage,
        size: PAGE_SIZE,
        dateFrom: criteria.dateFrom ? `${criteria.dateFrom}T00:00:00` : undefined,
        dateTo: criteria.dateTo ? `${criteria.dateTo}T23:59:59` : undefined,
        status: criteria.status || undefined,
        mode: criteria.mode || undefined,
        creditNote: criteria.creditNote === '' ? undefined : criteria.creditNote === 'true',
        query: criteria.query.trim() || undefined,
      }
      const response = await reportsAPI.fiscalSubmissions(params)
      setReport({
        content: Array.isArray(response.data?.content) ? response.data.content : [],
        totalElements: Number(response.data?.totalElements) || 0,
        totalPages: Number(response.data?.totalPages) || 0,
      })
    } catch (error) {
      setReport({ content: [], totalElements: 0, totalPages: 0 })
      setLoadError(getApiErrorMessage(error, 'Unable to load fiscal submission reports.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReport(appliedFilters, page)
  }, [appliedFilters, page, loadReport])

  const pageStats = useMemo(() => ({
    accepted: report.content.filter((row) => row.submissionStatus === 'ACCEPTED').length,
    rejected: report.content.filter((row) => ['REJECTED', 'FAILED'].includes(row.submissionStatus)).length,
    fixtures: report.content.filter((row) => String(row.submissionMode || '').toUpperCase() === 'FIXTURE').length,
  }), [report.content])

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }))

  const applyFilters = (event) => {
    event.preventDefault()
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      setLoadError('The start date must be on or before the end date.')
      return
    }
    setLoadError('')
    setPage(0)
    setAppliedFilters({ ...filters })
  }

  const exportPage = () => {
    const header = [
      'Fiscal record ID', 'POS transaction ID', 'Authority transaction ID', 'Fiscal reference',
      'Status', 'Mode', 'Credit note', 'Original transaction ID', 'Created at', 'Submitted at',
      'Authority response code', 'Authority response message', 'TIN', 'Register',
      'Currency', 'Gross amount', 'VAT amount', 'Service fee amount', 'Net amount',
    ]
    const rows = report.content.map((row) => [
      row.taxTransactionId, row.posTransactionId, row.authorityTransactionId, row.fiscalReference,
      row.submissionStatus, row.submissionMode, row.isCreditNote, row.originalTransactionId,
      row.createdAt, row.submittedToAuthorityAt, row.authorityResponseCode, row.authorityResponseMessage, row.tin,
      row.terminalId, row.currencyCode, row.grossAmount, row.vatAmount,
      row.serviceFeeAmount, row.netAmount,
    ])
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `fiscal-submissions-page-${page + 1}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Fiscal reports</h1>
          <p className="mt-1 text-gray-500">Review saved fiscal submission outcomes, authority references, tax amounts, and credit-note links.</p>
        </div>
        <Button type="button" variant="outline" onClick={exportPage} disabled={loading || report.content.length === 0}>
          <Download className="mr-2 h-4 w-4" />Export current page
        </Button>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        This report lists fiscal submission records saved by the backend. Fixture and NOT_CONFIGURED results are application workflow records, not proof of submission to or acceptance by a live tax authority. Browser-only POS fixture transactions do not create backend fiscal records and are not listed here.
      </div>

      <Card>
        <CardContent className="pt-6">
          <form className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 xl:grid-cols-6" onSubmit={applyFilters}>
            <div>
              <label htmlFor="fiscal-date-from" className="mb-1 block text-sm font-medium text-gray-700">Created from</label>
              <Input id="fiscal-date-from" type="date" value={filters.dateFrom} onChange={(event) => updateFilter('dateFrom', event.target.value)} />
            </div>
            <div>
              <label htmlFor="fiscal-date-to" className="mb-1 block text-sm font-medium text-gray-700">Created to</label>
              <Input id="fiscal-date-to" type="date" value={filters.dateTo} onChange={(event) => updateFilter('dateTo', event.target.value)} />
            </div>
            <div>
              <label htmlFor="fiscal-status" className="mb-1 block text-sm font-medium text-gray-700">Submission status</label>
              <select id="fiscal-status" className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
                <option value="">All statuses</option>
                {['PENDING', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'FAILED', 'QUEUED'].map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="fiscal-mode" className="mb-1 block text-sm font-medium text-gray-700">Submission mode</label>
              <select id="fiscal-mode" className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm" value={filters.mode} onChange={(event) => updateFilter('mode', event.target.value)}>
                <option value="">All modes</option>
                <option value="FIXTURE">Fixture</option>
                <option value="NOT_CONFIGURED">Not configured</option>
                <option value="LEGACY">Legacy</option>
              </select>
            </div>
            <div>
              <label htmlFor="fiscal-credit-note" className="mb-1 block text-sm font-medium text-gray-700">Document kind</label>
              <select id="fiscal-credit-note" className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm" value={filters.creditNote} onChange={(event) => updateFilter('creditNote', event.target.value)}>
                <option value="">All documents</option>
                <option value="false">Receipt</option>
                <option value="true">Credit note</option>
              </select>
            </div>
            <Button type="submit" disabled={loading}><Search className="mr-2 h-4 w-4" />Apply filters</Button>
            <div className="sm:col-span-2 xl:col-span-6">
              <label htmlFor="fiscal-search" className="mb-1 block text-sm font-medium text-gray-700">Find a fiscal or POS transaction</label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input id="fiscal-search" value={filters.query} onChange={(event) => updateFilter('query', event.target.value)} placeholder="Fiscal record ID, POS transaction ID, authority ID, reference, or TIN" />
                <Button type="submit" variant="outline" disabled={loading}><CalendarDays className="mr-2 h-4 w-4" />Refresh report</Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <ErrorNotice message={loadError} onRetry={() => loadReport(appliedFilters, page)} />

      <section aria-label="Fiscal submission report summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Matching submissions" value={report.totalElements.toLocaleString()} detail="All records matching the selected filters" />
        <Metric label="Accepted on this page" value={pageStats.accepted} detail={`Of ${report.content.length} records shown`} />
        <Metric label="Rejected or failed on this page" value={pageStats.rejected} detail={`Of ${report.content.length} records shown`} />
        <Metric label="Fixture records on this page" value={pageStats.fixtures} detail="Simulated outcomes, not authority confirmations" />
      </section>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Fiscal submission register</CardTitle>
            <p className="mt-2 text-sm text-gray-500">Amounts and outcomes come from stored fiscal submission records. Search results can include customer TIN data.</p>
          </div>
          <Button type="button" size="icon" variant="outline" title="Reload fiscal report" aria-label="Reload fiscal report" onClick={() => loadReport(appliedFilters, page)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center text-gray-500" role="status">Loading fiscal submissions…</div>
          ) : report.content.length === 0 ? (
            <div className="py-12 text-center">
              <FileCheck2 className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-3 font-medium text-gray-800">No fiscal submissions found</p>
              <p className="mt-1 text-sm text-gray-500">Adjust the date range or filters. A record appears here after the backend saves a fiscal submission outcome.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead>Fiscal record</TableHead>
                      <TableHead>POS transaction</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Status / mode</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead>Fiscal reference</TableHead>
                      <TableHead>Authority ID / submitted</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                      <TableHead className="text-right">Service fee</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead>Authority response</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.content.map((row) => (
                      <TableRow key={row.taxTransactionId}>
                        <TableCell className="whitespace-nowrap font-medium">
                          <Link className="text-[#9B2635] hover:text-[#7D1E2A] hover:underline" to={`/fiscal-reports/${encodeURIComponent(row.taxTransactionId)}`}>{row.taxTransactionId}</Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Link className="text-[#9B2635] hover:text-[#7D1E2A] hover:underline" to={`/transactions/${encodeURIComponent(row.posTransactionId)}`}>{row.posTransactionId}</Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{dateTime(row.createdAt)}</TableCell>
                        <TableCell className="space-y-1">
                          <StatusBadge status={row.submissionStatus} />
                          <span className="block text-xs text-gray-500">{row.submissionMode || 'Unknown mode'}</span>
                        </TableCell>
                        <TableCell>{row.isCreditNote ? <span className="font-medium text-violet-700">Credit note</span> : 'Receipt'}</TableCell>
                        <TableCell className="max-w-48 break-all">{row.fiscalReference || '—'}</TableCell>
                        <TableCell className="max-w-48">
                          <span className="block break-all">{row.authorityTransactionId || '—'}</span>
                          <span className="block text-xs text-gray-500">{dateTime(row.submittedToAuthorityAt)}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">{formatCurrency(row.grossAmount, row.currencyCode)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">{formatCurrency(row.vatAmount, row.currencyCode)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">{formatCurrency(row.serviceFeeAmount, row.currencyCode)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">{formatCurrency(row.netAmount, row.currencyCode)}</TableCell>
                        <TableCell className="max-w-64">
                          <span className="block font-medium">{row.authorityResponseCode || '—'}</span>
                          <span className="block text-xs text-gray-500">{row.authorityResponseMessage || 'No response message'}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, report.totalElements)} of {report.totalElements.toLocaleString()} submissions
                </p>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={loading || page === 0}>Previous</Button>
                  <span className="min-w-24 text-center text-sm text-gray-600">Page {page + 1} of {Math.max(report.totalPages, 1)}</span>
                  <Button type="button" variant="outline" onClick={() => setPage((current) => current + 1)} disabled={loading || page + 1 >= report.totalPages}>Next</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
