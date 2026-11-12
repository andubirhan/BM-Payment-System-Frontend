import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'

const COLORS = ['#9B2635', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

function formatPercentage(value) {
  const percentage = Number(value) || 0
  return percentage > 0 && percentage < 0.05 ? '<0.1%' : `${percentage.toFixed(1)}%`
}

export default function ReportsCharts({
  dailyRevenue,
  grossVsNet,
  grossNetMetrics,
  hasGrossNetChartData,
  paymentMethods,
  cashierPerformance,
}) {
  return (
    <>
      {dailyRevenue.length > 0 && <Card><CardHeader><CardTitle>Revenue trend</CardTitle></CardHeader><CardContent>
        <ResponsiveContainer width="100%" height={280}><LineChart data={dailyRevenue} margin={{ left: 12, right: 12 }}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis tickFormatter={(value) => new Intl.NumberFormat('en-UG', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}/><Tooltip formatter={(value) => formatCurrency(value)}/><Legend/><Line type="monotone" dataKey="totalRevenue" stroke="#9B2635" name="Net sales"/><Line type="monotone" dataKey="totalVat" stroke="#10b981" name="VAT"/></LineChart></ResponsiveContainer>
      </CardContent></Card>}
      <Card><CardHeader><div><CardTitle>Gross vs Net</CardTitle><p className="mt-1 text-sm text-gray-500">Amounts for the selected period</p></div></CardHeader><CardContent>
        {grossNetMetrics.length ? <div className="space-y-3">
          {hasGrossNetChartData && <ResponsiveContainer width="100%" height={230}><BarChart data={[{ period: 'Selected period', grossAmount: Number(grossVsNet.grossAmount) || 0, netAmount: Number(grossVsNet.netAmount) || 0 }]} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="period" tickLine={false}/><YAxis tickFormatter={(value) => new Intl.NumberFormat('en-UG', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} width={52}/><Tooltip formatter={(value) => formatCurrency(value)}/><Legend/><Bar dataKey="grossAmount" name="Gross" fill="#9B2635" radius={[4, 4, 0, 0]}/><Bar dataKey="netAmount" name="Net" fill="#059669" radius={[4, 4, 0, 0]}/></BarChart></ResponsiveContainer>}
          <dl className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">{grossNetMetrics.map(([label, value]) => <div key={label}><dt className="text-xs text-gray-500">{label === 'Gross amount' ? 'Gross amount (incl. VAT)' : label === 'Net amount' ? 'Net amount (excl. VAT)' : label}</dt><dd className="mt-1 font-semibold tabular-nums text-gray-900">{formatCurrency(value)}</dd></div>)}</dl>
        </div> : <p className="py-12 text-center text-sm text-gray-500">No gross vs net data is available for this period.</p>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Payment methods</CardTitle></CardHeader><CardContent>
        {paymentMethods.length ? <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><div className="h-[260px] min-w-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={paymentMethods} cx="50%" cy="50%" label={false} minAngle={3} outerRadius={96} dataKey="chartAmount" nameKey="paymentMethod">{paymentMethods.map((entry, index) => <Cell key={`${entry.paymentMethod}-${index}`} fill={COLORS[index % COLORS.length]} stroke="#fff" strokeWidth={2}/>)}</Pie><Tooltip formatter={(value, name, item) => [`${formatCurrency(value)} (${formatPercentage(item.payload.percentage)})`, name]}/></PieChart></ResponsiveContainer></div><ul className="space-y-3">{paymentMethods.map((method, index) => <li key={`${method.paymentMethod}-${index}`} className="flex min-w-0 items-start gap-2 text-sm"><span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: COLORS[index % COLORS.length] }} aria-hidden="true"/><div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-3"><span className="truncate font-medium text-gray-800">{method.paymentMethod}</span><span className="shrink-0 font-semibold tabular-nums text-gray-900">{formatPercentage(method.percentage)}</span></div><p className="mt-0.5 text-xs tabular-nums text-gray-500">{formatCurrency(method.totalAmount)}</p></div></li>)}</ul></div> : <p className="py-16 text-center text-sm text-gray-500">No payment method breakdown is available.</p>}
      </CardContent></Card>
      <Card className="lg:col-span-2"><CardHeader><CardTitle>Cashier performance</CardTitle></CardHeader><CardContent>
        {cashierPerformance.length ? <ResponsiveContainer width="100%" height={300}><BarChart data={cashierPerformance}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="cashierId"/><YAxis yAxisId="amount" tickFormatter={(value) => new Intl.NumberFormat('en-UG', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}/><YAxis yAxisId="count" orientation="right"/><Tooltip formatter={(value, name) => name === 'Revenue' ? formatCurrency(value) : value}/><Legend/><Bar yAxisId="amount" dataKey="totalRevenue" fill="#9B2635" name="Revenue"/><Bar yAxisId="count" dataKey="transactionCount" fill="#10b981" name="Transactions"/></BarChart></ResponsiveContainer> : <p className="py-12 text-center text-sm text-gray-500">No cashier performance data is available.</p>}
      </CardContent></Card>
    </>
  )
}
