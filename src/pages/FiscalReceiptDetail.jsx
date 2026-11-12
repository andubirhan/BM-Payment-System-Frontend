import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, ReceiptText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ErrorNotice from '@/components/ErrorNotice'
import { reportsAPI } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency } from '@/lib/format'

function displayDate(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString()
}

function Value({ label, value, mono = false }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={`mt-1 break-all text-sm text-gray-900 ${mono ? 'font-mono' : 'font-medium'}`}>{value || '—'}</dd>
    </div>
  )
}

function SubmissionStatus({ status }) {
  const statusClass = status === 'ACCEPTED'
    ? 'bg-emerald-100 text-emerald-800'
    : ['FAILED', 'REJECTED'].includes(status)
      ? 'bg-red-100 text-red-800'
      : 'bg-amber-100 text-amber-800'
  return <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${statusClass}`}>{status || 'UNKNOWN'}</span>
}

export default function FiscalReceiptDetail() {
  const { taxTransactionId } = useParams()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const receiptRef = useRef(null)
  const receiptContentRef = useRef(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    reportsAPI.fiscalSubmission(taxTransactionId)
      .then(({ data }) => {
        if (active) setDetail(data)
      })
      .catch((requestError) => {
        if (active) setError(getApiErrorMessage(requestError, 'Unable to load this fiscal submission.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [taxTransactionId])

  useEffect(() => {
    const finishPrint = () => {
      document.documentElement.classList.remove('fiscal-print-mode')
      receiptRef.current?.style.removeProperty('--fiscal-print-height')
      receiptContentRef.current?.style.removeProperty('--fiscal-print-scale')
    }
    window.addEventListener('afterprint', finishPrint)
    return () => {
      window.removeEventListener('afterprint', finishPrint)
      finishPrint()
    }
  }, [])

  const printReceipt = () => {
    const receipt = receiptRef.current
    const content = receiptContentRef.current
    if (!receipt || !content) return

    document.documentElement.classList.add('fiscal-print-mode')
    content.style.setProperty('--fiscal-print-scale', '1')
    requestAnimationFrame(() => {
      const pageWidth = (281 / 25.4) * 96
      const pageHeight = (194 / 25.4) * 96
      const contentWidth = content.scrollWidth
      const contentHeight = content.scrollHeight
      const scale = Math.min(1, pageWidth / contentWidth, pageHeight / contentHeight)
      content.style.setProperty('--fiscal-print-scale', String(scale))
      receipt.style.setProperty('--fiscal-print-height', `${contentHeight * scale}px`)
      requestAnimationFrame(() => window.print())
    })
  }

  const submission = detail?.submission
  const currencyCode = submission?.currencyCode

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <Link to="/fiscal-reports" className="mb-3 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />Fiscal reports
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{submission?.isCreditNote ? 'Fiscal credit note' : 'Fiscal receipt'}</h1>
          <p className="mt-1 break-all text-gray-500">Fiscal record {taxTransactionId}</p>
        </div>
        {detail && <Button type="button" variant="outline" onClick={printReceipt}><Printer className="mr-2 h-4 w-4" />Print receipt</Button>}
      </div>

      <ErrorNotice message={error} onRetry={() => window.location.reload()} />

      {loading ? (
        <div className="py-16 text-center text-gray-500" role="status">Loading fiscal receipt details…</div>
      ) : detail ? (
        <div ref={receiptRef} className="fiscal-receipt-page mx-auto max-w-5xl">
          <div ref={receiptContentRef} className="fiscal-receipt-print space-y-5">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 print:hidden">
            This receipt view is assembled from the saved fiscal submission record and its linked POS line items. The current fixture does not send data to a tax authority; its references and acceptance status are simulated. The application does not retain a raw authority wire-request payload.
          </div>
          <div className="hidden text-center print:block">
            <p className="text-xs font-semibold uppercase tracking-wide">Fiscal receipt record — test workflow</p>
            <p className="text-xs">Fixture status and references are simulated; no tax authority was contacted.</p>
          </div>

          <Card className="print:border-0 print:shadow-none">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="flex items-center gap-2 text-xl"><ReceiptText className="h-5 w-5 text-[#9B2635]" />Fiscal submission result</CardTitle>
              <p className="text-sm text-gray-500">Submission status and authority response recorded by the backend.</p>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="flex flex-wrap items-center gap-3">
                <SubmissionStatus status={submission.submissionStatus} />
                <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">{submission.submissionMode || 'Unknown mode'}</span>
                {submission.isCreditNote && <span className="rounded-full bg-violet-100 px-3 py-1 text-sm font-medium text-violet-800">Credit note</span>}
              </div>
              <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <Value label="Fiscal record ID" value={submission.taxTransactionId} mono />
                <Value label="Fiscal receipt reference" value={submission.fiscalReference} mono />
                <Value label="Authority transaction ID" value={submission.authorityTransactionId} mono />
                <Value label="POS transaction ID" value={submission.posTransactionId} mono />
                <Value label="Original transaction ID" value={submission.originalTransactionId} mono />
                <Value label="Business type" value={detail.businessTransactionType || detail.transactionType} />
                <Value label="Created in system" value={displayDate(submission.createdAt)} />
                <Value label="Submission timestamp" value={displayDate(submission.submittedToAuthorityAt)} />
                <Value label="Currency" value={currencyCode} />
                <Value label="Register" value={submission.terminalId} />
                <Value label="Customer / taxpayer" value={detail.customerName} />
                <Value label="TIN (TAX Identification number)" value={detail.customerTin} mono />
                <Value label="Tax prices include VAT" value={detail.pricesIncludeVat == null ? '—' : detail.pricesIncludeVat ? 'Yes' : 'No'} />
              </dl>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h2 className="font-semibold text-gray-900">Authority response</h2>
                <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Value label="Response code" value={submission.authorityResponseCode} mono />
                  <Value label="Response message" value={submission.authorityResponseMessage} />
                </dl>
              </div>

              <div>
                <h2 className="mb-3 font-semibold text-gray-900">Receipt line items</h2>
                {detail.lineItems?.length ? (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full min-w-[850px] text-sm">
                      <thead className="bg-gray-50 text-left text-gray-600">
                        <tr>
                          <th className="px-3 py-3 font-medium">Item</th>
                          <th className="px-3 py-3 text-right font-medium">Qty</th>
                          <th className="px-3 py-3 text-right font-medium">Unit price</th>
                          <th className="px-3 py-3 text-right font-medium">Discount</th>
                          <th className="px-3 py-3 font-medium">VAT category / rate</th>
                          <th className="px-3 py-3 text-right font-medium">Gross</th>
                          <th className="px-3 py-3 text-right font-medium">VAT</th>
                          <th className="px-3 py-3 text-right font-medium">Service fee</th>
                          <th className="px-3 py-3 text-right font-medium">Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.lineItems.map((item, index) => (
                          <tr key={`${item.itemCode}-${index}`} className="border-t border-gray-100">
                            <td className="px-3 py-3">
                              <span className="block font-medium text-gray-900">{item.itemName}</span>
                              <span className="block text-xs text-gray-500">{item.itemCode}{item.itemDescription ? ` · ${item.itemDescription}` : ''}</span>
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">{item.quantity ?? '—'}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(item.unitPrice, currencyCode)}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(item.discountAmount, currencyCode)}</td>
                            <td className="px-3 py-3">{item.vatCategory || (item.vatExempt ? 'Exempt' : '—')} {item.vatRate != null ? `· ${(Number(item.vatRate) * 100).toFixed(2)}%` : ''}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(item.grossAmount, currencyCode)}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(item.vatAmount, currencyCode)}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(item.serviceFeeAmount, currencyCode)}</td>
                            <td className="px-3 py-3 text-right font-medium tabular-nums">{formatCurrency(item.netAmount, currencyCode)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    No line-item snapshot is available for this POS transaction. The fiscal totals below are still shown from the stored submission record.
                  </p>
                )}
              </div>

              <div className="ml-auto grid max-w-md grid-cols-2 gap-x-6 gap-y-2 border-t border-gray-200 pt-4 text-sm">
                <span className="text-gray-600">Gross total</span><strong className="text-right">{formatCurrency(submission.grossAmount, currencyCode)}</strong>
                <span className="text-gray-600">VAT total</span><strong className="text-right">{formatCurrency(submission.vatAmount, currencyCode)}</strong>
                <span className="text-gray-600">Withholding VAT</span><strong className="text-right">−{formatCurrency(Math.abs(Number(detail.withholdingVatAmount) || 0), currencyCode)}</strong>
                <span className="text-gray-600">Service fee</span><strong className="text-right">{formatCurrency(submission.serviceFeeAmount, currencyCode)}</strong>
                <span className="border-t border-gray-200 pt-2 font-semibold text-gray-900">Net total</span><strong className="border-t border-gray-200 pt-2 text-right text-gray-900">{formatCurrency(submission.netAmount, currencyCode)}</strong>
              </div>

              {submission.originalTransactionId && (
                <p className="text-sm text-gray-600">This credit note is linked to original transaction <span className="font-mono font-medium text-gray-900">{submission.originalTransactionId}</span>.</p>
              )}
            </CardContent>
          </Card>
          </div>
        </div>
      ) : null}
    </div>
  )
}
