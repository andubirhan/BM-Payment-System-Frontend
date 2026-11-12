import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Lock, User } from 'lucide-react'
import ErrorNotice from '@/components/ErrorNotice'
import CompanyFooter from '@/components/CompanyFooter'
import CompanyLogo from '@/components/CompanyLogo'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const location = useLocation()
  const { login, loading, isAuthenticated } = useAuth()

  if (isAuthenticated()) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!username.trim() || !password) {
      setError('Please enter both username and password')
      return
    }

    const result = await login(username.trim(), password)
    if (!result.success) {
      setError(result.error || 'Login failed')
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#F6F4F2] px-4">
      <div className="my-auto w-full max-w-md py-8">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <CompanyLogo className="mb-3 justify-center" />
            <h1 className="text-3xl font-bold tracking-tight text-[#302724]">POS VAT System</h1>
            <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-[#9B2635]" />
            <p className="mt-2 text-sm text-gray-600">Sign in to your account</p>
          </div>

          <div className="mb-6">
            {location.state?.sessionExpired && (
              <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
                Your session expired. Please sign in again to continue.
              </p>
            )}
            <ErrorNotice message={error} />
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm focus:border-[#9B2635] focus:ring-2 focus:ring-[#9B2635]"
                  placeholder="Enter your username"
                  autoComplete="username"
                  required
                  aria-invalid={Boolean(error)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm focus:border-[#9B2635] focus:ring-2 focus:ring-[#9B2635]"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  aria-invalid={Boolean(error)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full justify-center rounded-lg border border-transparent bg-[#9B2635] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#7D1E2A] focus:outline-none focus:ring-2 focus:ring-[#9B2635] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              <strong>Demo Credentials:</strong>
            </p>
            <div className="mt-2 space-y-1 text-xs text-gray-600">
              <p>Admin: admin / admin123</p>
              <p>Cashier: cashier / cashier123</p>
              <p>Manager: manager / manager123</p>
            </div>
          </div>
        </div>

      </div>
      <CompanyFooter className="w-full max-w-6xl border-t-0 bg-transparent px-2" />
    </div>
  )
}
