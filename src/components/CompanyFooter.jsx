import { Link } from 'react-router-dom'
import CompanyLogo from '@/components/CompanyLogo'
import { company } from '@/lib/company'

export default function CompanyFooter({ className = '' }) {
  return (
    <footer className={`border-t border-[#DED9D5] bg-white ${className}`}>
      <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <CompanyLogo />
          <p className="text-xs text-gray-500">© {new Date().getFullYear()} {company.name}</p>
        </div>
        <nav aria-label="Company information" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Link className="text-gray-600 hover:text-[#9B2635] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9B2635]" to="/about">About us</Link>
          <Link className="text-gray-600 hover:text-[#9B2635] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9B2635]" to="/contact">Contact us</Link>
          <a className="text-gray-600 hover:text-[#9B2635] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9B2635]" href={company.linkedIn} target="_blank" rel="noreferrer">LinkedIn</a>
        </nav>
      </div>
    </footer>
  )
}
