import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Layout from '@/components/Layout'
import ErrorBoundary from '@/components/ErrorBoundary'
import ProtectedRoute from '@/components/ProtectedRoute'
import { AuthProvider } from '@/contexts/AuthContext'
import { ErrorProvider } from '@/contexts/ErrorContext'

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Search = lazy(() => import('@/pages/Search'))
const BankPayments = lazy(() => import('@/pages/BankPayments'))
const Sales = lazy(() => import('@/pages/Sales'))
const Reports = lazy(() => import('@/pages/Reports'))
const ItemReport = lazy(() => import('@/pages/ItemReport'))
const FinancialReport = lazy(() => import('@/pages/FinancialReport'))
const FiscalReports = lazy(() => import('@/pages/FiscalReports'))
const FiscalReceiptDetail = lazy(() => import('@/pages/FiscalReceiptDetail'))
const Settings = lazy(() => import('@/pages/Settings'))
const NewTransaction = lazy(() => import('@/pages/NewTransaction'))
const TransactionDetail = lazy(() => import('@/pages/TransactionDetail'))
const Login = lazy(() => import('@/pages/Login'))
const TerminalPurchase = lazy(() => import('@/pages/TerminalPurchase'))
const PaymentChannelRouter = lazy(() => import('@/pages/PaymentChannelRouter'))
const TestTransactionBuilder = lazy(() => import('@/pages/TestTransactionBuilder'))
const About = lazy(() => import('@/pages/About'))
const Contact = lazy(() => import('@/pages/Contact'))

function App() {
  return (
    <ErrorBoundary>
      <ErrorProvider>
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<div className="py-20 text-center text-sm text-gray-500" role="status">Loading page...</div>}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/about" element={<About />} />
                <Route path="/contact" element={<Contact />} />
                <Route
                  path="/*"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Suspense fallback={<div className="py-20 text-center text-sm text-gray-500" role="status">Loading page...</div>}>
                          <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/transactions/new" element={<NewTransaction />} />
                            <Route path="/transaction-actions" element={<NewTransaction actionsOnly />} />
                            <Route path="/mock-transaction-files" element={<TestTransactionBuilder />} />
                            <Route path="/payment-router" element={<PaymentChannelRouter />} />
                            <Route path="/terminal/purchase" element={<TerminalPurchase />} />
                            <Route path="/transactions/:transactionId" element={<TransactionDetail />} />
                            <Route path="/search" element={<Search />} />
                            <Route path="/bank-payments" element={<BankPayments />} />
                            <Route path="/sales" element={<Sales />} />
                            <Route path="/reports" element={<Reports />} />
                            <Route path="/item-report" element={<ItemReport />} />
                            <Route path="/financial-report" element={<FinancialReport />} />
                            <Route path="/fiscal-reports" element={<FiscalReports />} />
                            <Route path="/fiscal-reports/:taxTransactionId" element={<FiscalReceiptDetail />} />
                            <Route path="/settings" element={<Settings />} />
                            <Route path="*" element={<div className="mx-auto max-w-xl py-20 text-center"><h1 className="text-2xl font-bold text-gray-900">Page not found</h1><p className="mt-2 text-gray-600">The page you requested does not exist.</p><Link className="mt-5 inline-flex font-medium text-[#9B2635] hover:text-[#7D1E2A]" to="/">Return to dashboard</Link></div>} />
                          </Routes>
                        </Suspense>
                      </Layout>
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </ErrorProvider>
    </ErrorBoundary>
  )
}

export default App
