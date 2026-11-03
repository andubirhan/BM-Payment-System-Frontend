import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, LoaderCircle, ReceiptText, Workflow } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { bankPaymentAPI, searchAPI, transactionAPI } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency, getStatusClasses, getStatusLabel } from '@/lib/format'
import ErrorNotice from '@/components/ErrorNotice'
import { format } from 'date-fns'

function displayDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : format(date, 'MMM d, yyyy HH:mm')
}

function transactionFromResponse(data, requestedId) {
  const payload = data?.data ?? data?.body ?? data
  const records = Array.isArray(payload) ? payload : Array.isArray(payload?.content) ? payload.content : null
  return records ? records.find((item) => item.transactionId === requestedId) || records[0] : payload
}

function getRemainingRefundableAmount(transaction) {
  const capturedAmount = Number(transaction.totalAmountPaid) || 0
  const refundableCap = Number(transaction.refundableAmount ?? capturedAmount) || 0
  const refundedAmount = Number(transaction.refundedAmount) || 0
  return Math.max(0, Math.min(capturedAmount, refundableCap) - refundedAmount)
}

export default function TransactionDetail() {
  const { transactionId } = useParams()
  const [transaction, setTransaction] = useState(null)
  const [relatedTransactions, setRelatedTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setTransaction(null)
    setRelatedTransactions([])
    async function loadTransaction() {
      try {
        let record
        try {
          const response = await transactionAPI.getById(transactionId)
          record = transactionFromResponse(response.data, transactionId)
        } catch (detailError) {
          const response = await searchAPI.fullText(transactionId, 0, 10)
          record = transactionFromResponse(response.data, transactionId)
          if (!record) throw detailError
        }
        if (!record) throw new Error('The backend returned no transaction record.')
        if (!active) return
        setTransaction(record)
        setLoading(false)

        const requests = [searchAPI.children(transactionId)]
        if (record.parentTransactionId) requests.push(transactionAPI.getById(record.parentTransactionId))
        const backgroundRequests = [Promise.allSettled(requests)]
        if (record.befaPaymentId && (!record.lineItems?.length || !record.paymentTenders?.length)) {
          backgroundRequests.push(
            bankPaymentAPI.getBefaPayment({
              befaPaymentId: record.befaPaymentId,
              cashRegisterId: record.cashRegisterId,
              cashierId: record.cashierId,
            }).then((response) => {
              if (!active) return null
              const befaData = response.data
              setTransaction((current) => current ? {
                ...current,
                customerName: current.customerName || befaData.customerName,
                customerTin: current.customerTin || befaData.customerTin,
                grossAmount: current.grossAmount ?? befaData.grossAmount ?? befaData.amountInCents,
                netAmount: current.netAmount ?? befaData.netAmount ?? befaData.amountInCents,
                lineItems: current.lineItems?.length ? current.lineItems : befaData.lineItems,
                paymentTenders: current.paymentTenders?.length ? current.paymentTenders : befaData.paymentTenders,
              } : current)
              return null
            }).catch(() => null),
          )
        }
        const [relatedResults] = await Promise.all(backgroundRequests)
        if (!active) return
        const records = relatedResults
          .filter((result) => result.status === 'fulfilled')
          .flatMap((result) => {
            const data = result.value.data
            return Array.isArray(data) ? data : Array.isArray(data?.content) ? data.content : [data]
          })
          .filter((item) => item?.transactionId && item.transactionId !== record.transactionId)
        setRelatedTransactions([...new Map(records.map((item) => [item.transactionId, item])).values()])
      } catch (loadError) {
        if (active) setError(getApiErrorMessage(loadError, 'Unable to load this transaction.'))
      } finally {
        if (active) setLoading(false)
      }
    }
    loadTransaction()
    return () => { active = false }
  }, [transactionId])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link to="/transactions" className="mb-3 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"><ArrowLeft className="h-4 w-4" /> Transactions</Link>
        <h1 className="text-3xl font-bold text-gray-900">{transaction?.transactionType ? `${transaction.transactionType.replaceAll('_', ' ')} transaction` : 'Transaction details'}</h1>
        <p className="mt-1 break-all text-gray-500">{transactionId}</p>
      </div>
      <ErrorNotice message={error} onRetry={() => window.location.reload()} />
      {loading ? <div className="flex items-center justify-center gap-2 py-16 text-gray-500" role="status"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Loading transaction</div> : transaction ? (
        <>
          <div className="flex flex-wrap gap-3">
            <Link to="/transaction-actions" state={{ transactionId: transaction.transactionId }}>
              <Button variant="outline"><Workflow className="mr-2 h-4 w-4" />Manage this transaction</Button>
            </Link>
          </div>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-blue-600" />Summary</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Value label="Transaction ID" value={transaction.transactionId || transactionId} />
                <Value label="BEFA payment ID" value={transaction.befaPaymentId} />
                <Value label="Idempotency key" value={transaction.idempotencyKey} />
                <Value label="Bank transaction ID" value={transaction.bankTransactionId} />
                <div><dt className="text-xs font-medium text-gray-500">Status</dt><dd className="mt-1"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(transaction.status)}`}>{getStatusLabel(transaction.status)}</span></dd></div>
                <Value label="Type" value={transaction.transactionType} />
                <Value label="Customer" value={transaction.customerName || 'Guest'} />
                <Value label="TIN (TAX Identification number)" value={transaction.customerTin} />
                <Value label="Created" value={displayDate(transaction.createdAt)} />
                <Value label="Gross amount" value={formatCurrency(transaction.grossAmount, transaction.currencyCode)} />
                <Value label="Net amount" value={formatCurrency(transaction.netAmount, transaction.currencyCode)} />
                <Value label="VAT" value={formatCurrency(transaction.vatAmount ?? transaction.totalVat, transaction.currencyCode)} />
                <Value label="Withholding VAT" value={`−${formatCurrency(Math.abs(Number(transaction.withholdingVatAmount) || 0), transaction.currencyCode)}`} />
                <Value label="Service fees" value={formatCurrency(transaction.serviceFeeAmount, transaction.currencyCode)} />
                <Value label="Amount paid" value={formatCurrency(transaction.totalAmountPaid, transaction.currencyCode)} />
                {String(transaction.businessTransactionType || transaction.transactionType || '').toUpperCase() === 'SALE' && (
                  <>
                    <Value label="Refunded amount" value={formatCurrency(transaction.refundedAmount, transaction.currencyCode)} />
                    <Value label="Original refundable cap" value={formatCurrency(transaction.refundableAmount ?? transaction.totalAmountPaid, transaction.currencyCode)} />
                  <Value label="Refundable amount" value={formatCurrency(getRemainingRefundableAmount(transaction), transaction.currencyCode)} />
                  </>
                )}
                <Value label="Payment method" value={transaction.paymentMethod || transaction.paymentTenders?.map((tender) => tender.paymentMethod).filter(Boolean).join(', ')} />
                <Value label="Cash register" value={transaction.cashRegisterId} />
                <Value label="Cashier" value={transaction.cashierId} />
                <Value label="Fiscal reference" value={transaction.fiscalReference} />
                <Value label="Fiscal signature" value={transaction.fiscalSignature} />
                <Value label="Fiscal submission status" value={transaction.fiscalSubmissionStatus} />
                <Value label="Fiscal submission mode" value={transaction.fiscalSubmissionMode} />
                <Value label="Authority response code" value={transaction.fiscalAuthorityResponseCode} />
                <Value label="Authority response" value={transaction.fiscalAuthorityResponseMessage} />
                <Value label="Fiscal submission time" value={displayDate(transaction.fiscalSubmittedToAuthorityAt)} />
                <Value label="Authorised at" value={displayDate(transaction.authorizedAt)} />
                <Value label="Captured at" value={displayDate(transaction.capturedAt)} />
                <Value label="Settled at" value={displayDate(transaction.settledAt)} />
                {transaction.cancellationReason && <Value label="Reason" value={transaction.cancellationReason} />}
              </dl>
            </CardContent>
          </Card>
          {Array.isArray(transaction.lineItems) && transaction.lineItems.length > 0 && (
            <Card><CardHeader><CardTitle>Items</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-gray-500"><tr><th className="pb-2">Item</th><th className="pb-2">Code</th><th className="pb-2 text-right">Quantity</th><th className="pb-2 text-right">Gross</th><th className="pb-2 text-right">VAT</th><th className="pb-2 text-right">Service fee</th><th className="pb-2 text-right">Net</th></tr></thead><tbody>{transaction.lineItems.map((item, index) => <tr key={`${item.id || item.itemCode || 'item'}-${index}`} className="border-t border-gray-100"><td className="py-3">{item.itemName || '—'}</td><td className="py-3">{item.itemCode || '—'}</td><td className="py-3 text-right">{item.quantity ?? '—'}</td><td className="py-3 text-right">{formatCurrency(item.lineGrossAmount ?? item.grossAmount ?? item.amount ?? item.totalAmount, transaction.currencyCode)}</td><td className="py-3 text-right">{formatCurrency(item.lineVatAmount ?? item.vatAmount, transaction.currencyCode)}</td><td className="py-3 text-right">{formatCurrency(item.lineServiceFeeAmount ?? item.serviceFeeAmount, transaction.currencyCode)}</td><td className="py-3 text-right">{formatCurrency(item.lineNetAmount ?? item.netAmount, transaction.currencyCode)}</td></tr>)}</tbody></table></CardContent></Card>
          )}
          {Array.isArray(transaction.paymentTenders) && transaction.paymentTenders.length > 0 && (
            <Card><CardHeader><CardTitle>Payment tenders</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-gray-500"><tr><th className="pb-2">Method</th><th className="pb-2">Provider</th><th className="pb-2">Card</th><th className="pb-2">Status</th><th className="pb-2">Reference</th><th className="pb-2 text-right">Tendered</th><th className="pb-2 text-right">Applied</th></tr></thead><tbody>{transaction.paymentTenders.map((tender, index) => <tr key={`${tender.id || tender.paymentMethod || 'tender'}-${index}`} className="border-t border-gray-100"><td className="py-3">{tender.paymentMethod || '—'}</td><td className="py-3">{tender.paymentProvider || '—'}</td><td className="py-3">{[tender.cardBrand, tender.cardLastFour].filter(Boolean).join(' · ') || '—'}</td><td className="py-3">{tender.status || '—'}</td><td className="py-3">{tender.transactionReference || tender.rrn || tender.authCode || '—'}</td><td className="py-3 text-right">{formatCurrency(tender.amountTendered, transaction.currencyCode)}</td><td className="py-3 text-right">{formatCurrency(tender.amountApplied, transaction.currencyCode)}</td></tr>)}</tbody></table></CardContent></Card>
          )}
          {Array.isArray(transaction.auditLogs) && transaction.auditLogs.length > 0 && (
            <Card><CardHeader><CardTitle>Status and audit history</CardTitle></CardHeader><CardContent><ol className="space-y-4">{[...transaction.auditLogs].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map((entry, index) => <li key={`${entry.id || entry.action}-${index}`} className="border-l-2 border-blue-200 pl-4"><p className="text-sm font-semibold text-gray-900">{entry.action || 'Update'}{entry.toStatus ? ` · ${getStatusLabel(entry.toStatus)}` : ''}</p><p className="mt-1 text-xs text-gray-600">{entry.fromStatus ? `${getStatusLabel(entry.fromStatus)} → ` : ''}{entry.toStatus ? getStatusLabel(entry.toStatus) : ''}{entry.actorId ? ` · ${entry.actorId}` : ''}{entry.actorRole ? ` (${entry.actorRole})` : ''}</p>{(entry.reason || entry.payloadDetails) && <p className="mt-1 text-sm text-gray-600">{entry.reason || (typeof entry.payloadDetails === 'string' ? entry.payloadDetails : JSON.stringify(entry.payloadDetails))}</p>}<time className="mt-1 block text-xs text-gray-500">{displayDate(entry.createdAt)}</time></li>)}</ol></CardContent></Card>
          )}
          <Card>
            <CardHeader><CardTitle>Related transactions</CardTitle></CardHeader>
            <CardContent>
              {relatedTransactions.length ? <div className="divide-y divide-gray-100">{relatedTransactions.map((record) => <Link key={record.transactionId} to={`/transactions/${encodeURIComponent(record.transactionId)}`} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><span><span className="block text-sm font-semibold text-blue-700">{record.transactionId}</span><span className="text-xs text-gray-500">{record.transactionType || 'Related transaction'} · {displayDate(record.createdAt)}{String(record.transactionType).toUpperCase() === 'REFUND' ? ` · ${formatCurrency(record.netAmount, record.currencyCode)}` : ''}</span></span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(record.status)}`}>{getStatusLabel(record.status)}</span></Link>)}</div> : <p className="text-sm text-gray-500">No refunds, reversals, or related transactions are recorded.</p>}
            </CardContent>
          </Card>
        </>
      ) : !error ? <p className="py-12 text-center text-gray-500">No transaction data was returned.</p> : null}
      <div><Link to="/transactions"><Button variant="outline">Back to transactions</Button></Link></div>
    </div>
  )
}

function Value({ label, value }) {
  return <div className="min-w-0"><dt className="text-xs font-medium text-gray-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-gray-900">{value === null || value === undefined || value === '' ? '—' : value}</dd></div>
}
