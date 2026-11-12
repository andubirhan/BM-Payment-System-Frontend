import { useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Banknote, CheckCircle2, CreditCard, LoaderCircle, Store } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { bankPaymentAPI } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/apiError'
import ErrorNotice from '@/components/ErrorNotice'

const TRANSACTION_OPTIONS = {
  SALE: {
    label: 'Sale',
    description: 'Customer payment collected at the point of sale.',
    channel: 'POS terminal',
    Icon: Store,
  },
  PURCHASE: {
    label: 'Purchase',
    description: 'Supplier or business payment processed through the bank.',
    channel: 'Bank payment',
    Icon: Banknote,
  },
}

const INITIAL_IDENTIFIERS = {
  befaPaymentId: '',
  cashierId: 'cashier-001',
  cashRegisterId: 'reg-001',
}

export default function PaymentChannelRouter() {
  const location = useLocation()
  const navigate = useNavigate()
  const [transactionType, setTransactionType] = useState(() => {
    const requestedType = location.state?.transactionType
    return Object.hasOwn(TRANSACTION_OPTIONS, requestedType) ? requestedType : ''
  })
  const [isPreAuth, setIsPreAuth] = useState(false)
  const requestedType = Object.hasOwn(TRANSACTION_OPTIONS, location.state?.transactionType)
    ? location.state.transactionType
    : null
  const visibleOptions = requestedType
    ? [[requestedType, TRANSACTION_OPTIONS[requestedType]]]
    : Object.entries(TRANSACTION_OPTIONS)
  const [identifiers, setIdentifiers] = useState(INITIAL_IDENTIFIERS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadPaymentData = useCallback(async (event) => {
    event.preventDefault()
    const request = {
      befaPaymentId: identifiers.befaPaymentId.trim(),
      cashierId: identifiers.cashierId.trim(),
      cashRegisterId: identifiers.cashRegisterId.trim(),
      transactionType,
    }

    if (!transactionType) {
      setError('Choose whether this transaction is a sale or a purchase.')
      return
    }
    if (!request.befaPaymentId || !request.cashierId || !request.cashRegisterId) {
      setError('Enter the BEFA payment ID, cashier ID, and register ID.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await bankPaymentAPI.getBefaPayment(request)
      const paymentData = {
        ...response.data,
        befaPaymentId: response.data?.befaPaymentId || request.befaPaymentId,
        cashierId: response.data?.cashierId || request.cashierId,
        cashRegisterId: response.data?.cashRegisterId || request.cashRegisterId,
      }

      if (transactionType === 'SALE') {
        navigate('/terminal/purchase', {
          state: {
            preloadedData: paymentData,
            befaPaymentId: paymentData.befaPaymentId,
            paymentFlow: isPreAuth ? 'PRE_AUTH' : 'SALE',
            businessTransactionType: 'SALE',
            from: location.pathname,
          },
        })
      } else {
        navigate('/transactions/new', {
          state: {
            preloadedData: paymentData,
            transactionType: isPreAuth ? 'PRE_AUTH' : 'PURCHASE',
            businessTransactionType: 'PURCHASE',
          },
        })
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Unable to load BEFA payment data.'))
    } finally {
      setLoading(false)
    }
  }, [identifiers, isPreAuth, location.pathname, navigate, transactionType])

  const handleTransactionTypeChange = (type) => {
    setTransactionType(type)
    setError('')
  }

  const handleReset = () => {
    setIdentifiers(INITIAL_IDENTIFIERS)
    setError('')
  }

  const selectedOption = TRANSACTION_OPTIONS[transactionType]

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="mt-1 rounded-lg p-2 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[#9B2635]">Payment workflow</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">New transaction</h1>
          <p className="mt-2 max-w-2xl text-gray-600">
            Choose a transaction type, enter its BEFA identifiers, and load it directly into the matching payment channel.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#F8ECEE] p-3 text-[#9B2635]">
              <CreditCard className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <CardTitle className="text-xl">Choose transaction type</CardTitle>
              <p className="mt-1 text-sm text-gray-500">The selected type determines the payment channel.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Transaction type">
            {visibleOptions.map(([type, option]) => {
              const Icon = option.Icon
              const selected = transactionType === type
              const colorClass = type === 'SALE'
                ? selected ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20' : 'border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50'
                : selected ? 'border-[#9B2635] bg-[#FBF3F4] ring-2 ring-[#9B2635]/15' : 'border-gray-200 hover:border-[#C77A82] hover:bg-[#FBF6F6]'

              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTransactionTypeChange(type)}
                  aria-pressed={selected}
                  className={`flex min-h-28 items-start gap-4 rounded-xl border-2 p-4 text-left transition ${colorClass}`}
                >
                  <span className={`rounded-lg p-3 ${type === 'SALE' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#F8ECEE] text-[#9B2635]'}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="flex-1">
                    <span className="flex items-center justify-between gap-2 font-semibold text-gray-900">
                      {option.label}
                      {selected && <CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
                    </span>
                    <span className="mt-1 block text-sm leading-5 text-gray-600">{option.description}</span>
                    <span className="mt-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Routes to {option.channel}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {transactionType && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Load from BEFA</CardTitle>
            <p className="text-sm text-gray-500">Enter the three identifiers required to locate this transaction.</p>
          </CardHeader>
          <CardContent>
            <label className="mb-5 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3">
              <input
                type="checkbox"
                checked={isPreAuth}
                onChange={(event) => setIsPreAuth(event.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">Pre-authorize payment</span>
                <span className="mt-1 block text-xs text-gray-500">
                  Leave unchecked to complete the payment now. Select this to place an authorization hold and capture it later.
                </span>
              </span>
            </label>
            <form onSubmit={loadPaymentData} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  id="befa-payment-id"
                  label="BEFA Payment ID"
                  placeholder="e.g. BEFA-12345"
                  value={identifiers.befaPaymentId}
                  onChange={(value) => setIdentifiers((current) => ({ ...current, befaPaymentId: value }))}
                />
                <Field
                  id="cashier-id"
                  label="Cashier ID"
                  placeholder="Enter cashier ID"
                  value={identifiers.cashierId}
                  onChange={(value) => setIdentifiers((current) => ({ ...current, cashierId: value }))}
                />
                <Field
                  id="register-id"
                  label="Register ID"
                  placeholder="Enter register ID"
                  value={identifiers.cashRegisterId}
                  onChange={(value) => setIdentifiers((current) => ({ ...current, cashRegisterId: value }))}
                />
              </div>
              <p className="text-xs text-gray-500">
                BEFA Payment ID, Cashier ID, and Register ID are sent together to load the transaction.
              </p>
              <ErrorNotice message={error} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">
                  This will open {selectedOption.channel} with the loaded transaction.
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={handleReset} disabled={loading}>
                    Clear fields
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading || Object.values(identifiers).some((value) => !value.trim())}
                  >
                    {loading ? (
                      <>
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                        Loading and opening…
                      </>
                    ) : (
                      `Load ${isPreAuth ? 'pre-authorization' : 'payment'} to ${selectedOption.channel}`
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Field({ id, label, value, onChange, ...inputProps }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-gray-800">{label}</label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        {...inputProps}
      />
    </div>
  )
}
