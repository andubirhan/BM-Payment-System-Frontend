import { ArrowUpRight, Building2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import CompanyPublicLayout from '@/components/CompanyPublicLayout'
import { company } from '@/lib/company'

export default function About() {
  return (
    <CompanyPublicLayout>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#9B2635]">About the company</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">{company.name}</h1>
        <p className="mt-2 max-w-3xl text-gray-600">A diversified company working across technology and several industry sectors.</p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl">
            <Building2 className="h-5 w-5 text-[#9B2635]" aria-hidden="true" />
            Who we are
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-gray-600">
          <p>
            BM Technology PLC describes itself as a privately held company founded in 2022. Its public company profile lists work in construction, software development, mining, coffee processing, water bottling, and technology products trading.
          </p>
          <p>
            The profile also lists IT equipment supply, training, coffee export, and mineral water export among its specialties. This POS VAT System supports payment and VAT-related business workflows.
          </p>
          <a
            className="inline-flex items-center gap-1 font-semibold text-[#9B2635] hover:text-[#7D1E2A]"
            href={company.linkedIn}
            target="_blank"
            rel="noreferrer"
          >
            View the company profile on LinkedIn <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
          <p className="text-xs text-gray-400">Company information is summarized from BM Technology PLC’s public LinkedIn profile.</p>
        </CardContent>
      </Card>
    </CompanyPublicLayout>
  )
}
