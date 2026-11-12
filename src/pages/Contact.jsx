import { ExternalLink, Mail, MapPin, Phone } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import CompanyPublicLayout from '@/components/CompanyPublicLayout'
import { company } from '@/lib/company'

export default function Contact() {
  return (
    <CompanyPublicLayout>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#9B2635]">Get in touch</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">Contact us</h1>
        <p className="mt-2 max-w-2xl text-gray-600">Contact BM Technology PLC by email or phone, or find the published office location.</p>
      </div>

      <div className="grid max-w-4xl gap-5 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-3 text-lg"><Mail className="h-5 w-5 text-[#9B2635]" aria-hidden="true" />Email</CardTitle></CardHeader>
          <CardContent>
            <a className="break-all font-medium text-[#9B2635] hover:text-[#7D1E2A]" href={`mailto:${company.email}`}>{company.email}</a>
            <p className="mt-2 text-sm text-gray-500">Send a message to the company’s published contact email.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-3 text-lg"><Phone className="h-5 w-5 text-[#9B2635]" aria-hidden="true" />Phone</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {company.phones.map((phone) => <a key={phone.dial} className="block font-medium text-[#9B2635] hover:text-[#7D1E2A]" href={`tel:${phone.dial}`}>{phone.display}</a>)}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-3 text-lg"><MapPin className="h-5 w-5 text-[#9B2635]" aria-hidden="true" />Office</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-700">{company.address}</p>
            <a className="inline-flex items-center gap-2 rounded-md border border-[#DED9D5] px-3 py-2 text-sm font-medium text-gray-700 hover:border-[#9B2635] hover:text-[#9B2635]" href={company.mapSearch} target="_blank" rel="noreferrer">
              Open in Google Maps <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </CardContent>
        </Card>
      </div>
    </CompanyPublicLayout>
  )
}
