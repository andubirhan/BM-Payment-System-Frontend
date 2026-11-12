import { Link } from 'react-router-dom'
import CompanyFooter from '@/components/CompanyFooter'
import CompanyLogo from '@/components/CompanyLogo'

export default function CompanyPublicLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#F6F4F2]">
      <header className="border-b border-[#DED9D5] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link to="/about" aria-label="BM Technology PLC information">
            <CompanyLogo />
          </Link>
          <Link to="/login" className="rounded-md px-3 py-2 text-sm font-semibold text-[#9B2635] hover:bg-[#F6F1EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9B2635]">Sign in</Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      <CompanyFooter className="w-full px-6" />
    </div>
  )
}
