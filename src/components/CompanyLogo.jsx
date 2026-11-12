export default function CompanyLogo({ showName = true, dark = false, className = '' }) {
  const nameColor = dark ? 'text-[#D8CFCC]' : 'text-gray-500'

  return (
    <span className={`inline-flex shrink-0 items-end gap-1.5 ${className}`} aria-label="BM Technology PLC">
      <svg className="h-8 w-10" viewBox="0 0 40 32" role="img" aria-hidden="true">
        <text
          x="20"
          y="26"
          textAnchor="middle"
          fill="#9E2937"
          stroke="#211A18"
          strokeOpacity=".2"
          strokeWidth=".45"
          paintOrder="stroke"
          fontFamily="Arial, sans-serif"
          fontSize="29"
          fontWeight="900"
          fontStyle="italic"
          letterSpacing="-3"
        >
          bm
        </text>
      </svg>
      {showName && <span className={`mb-0.5 whitespace-nowrap text-[10px] font-medium tracking-wide ${nameColor}`}>BM Technology PLC</span>}
    </span>
  )
}