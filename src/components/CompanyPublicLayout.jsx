import { ArrowLeft } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import CompanyFooter from '@/components/CompanyFooter'
import CompanyLogo from '@/components/CompanyLogo'
import { useAuth } from '@/contexts/AuthContext'

export default function CompanyPublicLayout({ children }) {
  const location = useLocation()
  const { isAuthenticated } = useAuth()
  const isLoggedIn = isAuthenticated()
  const appPath = isLoggedIn ? '/' : '/login'

  return (
    <div className="flex min-h-screen flex-col bg-[#F6F4F2]">
      <header className="sticky top-0 z-30 border-b border-[#DED9D5] bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4">
          <Link to="/about" aria-label="BM Technology PLC information">
            <CompanyLogo />
          </Link>
          <nav aria-label="Company information" className="order-3 flex w-full items-center gap-2 border-t border-gray-100 pt-2 sm:order-none sm:w-auto sm:border-0 sm:pt-0">
            <Link
              to="/about"
              aria-current={location.pathname === '/about' ? 'page' : undefined}
              className={`rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9B2635] ${location.pathname === '/about' ? 'bg-[#F6F1EE] text-[#9B2635]' : 'text-gray-600 hover:bg-[#F6F1EE] hover:text-[#9B2635]'}`}
            >
              About us
            </Link>
            <Link
              to="/contact"
              aria-current={location.pathname === '/contact' ? 'page' : undefined}
              className={`rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9B2635] ${location.pathname === '/contact' ? 'bg-[#F6F1EE] text-[#9B2635]' : 'text-gray-600 hover:bg-[#F6F1EE] hover:text-[#9B2635]'}`}
            >
              Contact us
            </Link>
          </nav>
          <Link
            to={appPath}
            className="inline-flex items-center gap-2 rounded-md border border-[#DED9D5] px-3 py-2 text-sm font-semibold text-[#9B2635] hover:border-[#9B2635] hover:bg-[#F6F1EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9B2635]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {isLoggedIn ? 'Back to app' : 'Sign in'}
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      <CompanyFooter className="w-full px-6" />
    </div>
  )
}
