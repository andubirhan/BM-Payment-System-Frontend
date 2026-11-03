import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingCart,
  Search,
  BarChart3,
  FileSpreadsheet,
  FileCheck2,
  Settings,
  CreditCard,
  Menu,
  MonitorSmartphone,
  ClipboardList,
  PackageSearch,
  X,
  LogOut,
  User as UserIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useError } from '@/contexts/ErrorContext'
import { currencyAPI } from '@/lib/api'
import { setCurrencyCode } from '@/lib/format'
import ErrorDisplay from '@/components/ErrorDisplay'

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/search', label: 'Search', icon: Search },
  { path: '/mock-transaction-files', label: 'Upload test transaction data', icon: ClipboardList },
  { path: '/transactions', label: 'Transactions', icon: ShoppingCart },
  { path: '/bank-payments', label: 'Purchase', icon: CreditCard },
  { path: '/sales', label: 'SALE', icon: ShoppingCart },
  { path: '/transaction-actions', label: 'Transaction actions', icon: ClipboardList },
  { path: '/item-report', label: 'Item report', icon: PackageSearch },
  { path: '/financial-report', label: 'Financial report', icon: FileSpreadsheet },
  { path: '/fiscal-reports', label: 'Fiscal reports', icon: FileCheck2 },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/terminal/purchase', label: 'POS Terminal', icon: MonitorSmartphone },
  { path: '/settings', label: 'Settings', icon: Settings },
]

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const location = useLocation()
  const { user, logout } = useAuth()
  const { error, clearError } = useError()

  useEffect(() => {
    if (!sidebarOpen) return undefined
    const closeOnEscape = (event) => { if (event.key === 'Escape') setSidebarOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [sidebarOpen])

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  useEffect(() => {
    let active = true
    currencyAPI.get()
      .then(({ data }) => {
        if (active && data?.currencyCode) setCurrencyCode(data.currencyCode)
      })
      .catch((error) => {
        console.error('Unable to load configured currency; using the local default.', error)
      })
    return () => { active = false }
  }, [])

  const currentPage = navItems.find((item) => item.path === location.pathname)
    || navItems.find((item) => item.path !== '/' && location.pathname.startsWith(item.path))
    || { label: 'Page' }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <button
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation menu"
        />
      )}

      {/* Sidebar */}
      <aside
        id="primary-navigation"
        aria-label="Primary navigation"
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transform transition-all duration-200 ease-in-out md:translate-x-0",
          sidebarCollapsed ? "md:w-20" : "md:w-64",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          <div className={cn("flex items-center gap-3 border-b border-gray-200", sidebarCollapsed ? "p-4 md:gap-2 md:px-2" : "justify-between p-6")}>
            <button
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
              className="hidden shrink-0 rounded-md p-2 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex"
              aria-label={sidebarCollapsed ? 'Expand navigation menu' : 'Collapse navigation menu'}
              aria-expanded={!sidebarCollapsed}
              aria-controls="primary-navigation"
              title={sidebarCollapsed ? 'Expand navigation menu' : 'Collapse navigation menu'}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <h1 className={cn("text-xl font-bold text-gray-900", sidebarCollapsed && "md:sr-only")}>POS VAT System</h1>
            {sidebarCollapsed && <span className="hidden text-lg font-bold text-blue-700 md:block" aria-hidden="true">POS</span>}
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden p-2 rounded-md hover:bg-gray-100"
              aria-label="Close navigation menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-1", sidebarCollapsed ? "p-3 md:px-2" : "p-4")}>
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path || 
                (item.path !== '/' && location.pathname.startsWith(item.path))
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  state={item.path === '/terminal/purchase' ? { from: location.pathname } : undefined}
                  className={cn(
                    "flex items-center rounded-lg py-3 text-sm font-medium transition-colors",
                    sidebarCollapsed ? "justify-center px-3 md:px-0" : "gap-3 px-4",
                    isActive
                      ? "bg-blue-50 text-blue-600"
                      : "text-gray-700 hover:bg-gray-100"
                  )}
                  onClick={() => setSidebarOpen(false)}
                  title={sidebarCollapsed ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className={sidebarCollapsed ? 'md:sr-only' : undefined}>{item.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className={cn("border-t border-gray-200", sidebarCollapsed ? "p-3 md:px-2" : "p-4")}>
            {sidebarCollapsed ? (
              <div className="mx-auto hidden h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-800 md:flex" aria-label={user?.username || 'User'}>
                {user?.username?.substring(0, 2).toUpperCase() || 'U'}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <UserIcon className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 truncate">Logged in as:</p>
                    <p className="text-sm font-medium text-gray-700 truncate">{user?.username || 'Unknown'}</p>
                    <p className="text-xs text-gray-500">{user?.role || 'User'}</p>
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className={sidebarCollapsed ? 'md:pl-20' : 'md:pl-64'}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-7 bg-white border-b border-gray-200 px-8 py-7 md:gap-3 md:px-6 md:py-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden rounded-md p-2 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Open navigation menu"
            aria-expanded={sidebarOpen}
            aria-controls="primary-navigation"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="text-sm font-semibold text-gray-800">{currentPage.label}</span>
        </header>

        {/* Page content */}
        <main className="p-6">{children}</main>
      </div>

      {/* Error display at bottom */}
      <ErrorDisplay error={error} onDismiss={clearError} />
    </div>
  )
}
