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
  ClipboardList,
  PackageSearch,
  X,
  LogOut,
  User as UserIcon,
  Building2,
  Mail,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useError } from '@/contexts/ErrorContext'
import { currencyAPI } from '@/lib/api'
import { setCurrencyCode } from '@/lib/format'
import ErrorDisplay from '@/components/ErrorDisplay'
import CompanyFooter from '@/components/CompanyFooter'
import CompanyLogo from '@/components/CompanyLogo'

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/sales', label: 'SALE', icon: ShoppingCart },
  { path: '/bank-payments', label: 'Purchase', icon: CreditCard },
  { path: '/transaction-actions', label: 'Transaction actions', icon: ClipboardList },
  { path: '/search', label: 'Search', icon: Search },
  { path: '/item-report', label: 'Item report', icon: PackageSearch },
  { path: '/financial-report', label: 'Financial report', icon: FileSpreadsheet },
  { path: '/fiscal-reports', label: 'Fiscal reports', icon: FileCheck2 },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/mock-transaction-files', label: 'Upload test transaction data', icon: ClipboardList },
  { path: '/settings', label: 'Settings', icon: Settings },
  { path: '/about', label: 'About us', icon: Building2 },
  { path: '/contact', label: 'Contact us', icon: Mail },
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
    <div className="min-h-screen bg-[#F6F4F2]">
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
          "fixed top-0 left-0 z-50 h-full w-64 border-r border-[#393333] bg-[#242020] text-[#F7F4F2] shadow-[2px_0_12px_rgba(20,16,15,0.08)] transform transition-all duration-200 ease-in-out md:translate-x-0",
          sidebarCollapsed ? "md:w-20" : "md:w-64",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          <div className={cn("flex items-center gap-3 border-b border-[#393333]", sidebarCollapsed ? "p-4 md:justify-center md:gap-2 md:px-2" : "justify-between p-6")}>
            <button
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
              className="hidden shrink-0 rounded-md p-2 text-[#D8CFCC] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex"
              aria-label={sidebarCollapsed ? 'Expand navigation menu' : 'Collapse navigation menu'}
              aria-expanded={!sidebarCollapsed}
              aria-controls="primary-navigation"
              title={sidebarCollapsed ? 'Expand navigation menu' : 'Collapse navigation menu'}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className={cn("min-w-0", sidebarCollapsed && "md:hidden")}>
              <CompanyLogo dark showName />
              <h1 className="mt-1 text-sm font-bold tracking-tight text-[#F7F4F2]">POS VAT System</h1>
            </div>
            {sidebarCollapsed && <span className="hidden text-lg font-bold text-[#B83240] md:block" aria-hidden="true">POS</span>}
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded-md p-2 text-[#D8CFCC] hover:bg-white/10 md:hidden"
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
                      ? "border-l-2 border-[#B83240] bg-[#3A292A] text-[#F3C7C7]"
                      : "border-l-2 border-transparent text-[#D0C8C5] hover:bg-white/10 hover:text-white"
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

          <div className={cn("border-t border-[#393333]", sidebarCollapsed ? "p-3 md:px-2" : "p-4")}>
            {sidebarCollapsed ? (
              <div className="mx-auto hidden h-9 w-9 items-center justify-center rounded-full bg-[#453033] text-xs font-semibold text-[#F3C7C7] md:flex" aria-label={user?.username || 'User'}>
                {user?.username?.substring(0, 2).toUpperCase() || 'U'}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#453033]">
                    <UserIcon className="h-4 w-4 text-[#D88989]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs text-[#AFA4A0]">Logged in as:</p>
                    <p className="truncate text-sm font-medium text-[#F3EFED]">{user?.username || 'Unknown'}</p>
                    <p className="text-xs text-[#AFA4A0]">{user?.role || 'User'}</p>
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#D0C8C5] transition-colors hover:bg-white/10 hover:text-white"
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
      <div className={cn("flex min-h-screen flex-col", sidebarCollapsed ? 'md:pl-20' : 'md:pl-64')}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-7 border-b border-[#DED9D5] bg-white px-8 py-7 shadow-[0_1px_3px_rgba(36,32,32,0.04)] md:gap-3 md:px-6 md:py-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-2 text-[#514843] hover:bg-[#F6F1EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            aria-label="Open navigation menu"
            aria-expanded={sidebarOpen}
            aria-controls="primary-navigation"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="text-sm font-semibold text-[#473A36]">{currentPage.label}</span>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6">{children}</main>
        <CompanyFooter className="px-6" />
      </div>

      {/* Error display at bottom */}
      <ErrorDisplay error={error} onDismiss={clearError} />
    </div>
  )
}
