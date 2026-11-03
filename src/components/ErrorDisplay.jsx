import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function ErrorDisplay({ error, onDismiss }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isFading, setIsFading] = useState(false)
  const displayRef = useRef(null)
  const dismissTimer = useRef(null)
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    setIsExpanded(false)
    setIsFading(false)
    if (!error) return undefined

    const handleDocumentPointerDown = (event) => {
      if (displayRef.current?.contains(event.target)) {
        if (dismissTimer.current) {
          clearTimeout(dismissTimer.current)
          dismissTimer.current = null
          setIsFading(false)
        }
        return
      }

      if (dismissTimer.current) return
      setIsFading(true)
      dismissTimer.current = setTimeout(() => {
        dismissTimer.current = null
        onDismissRef.current?.()
      }, 5000)
    }

    document.addEventListener('pointerdown', handleDocumentPointerDown)
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown)
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current)
        dismissTimer.current = null
      }
    }
  }, [error])

  if (!error) return null

  const errorData = error.response?.data || error
  const code = errorData?.code || 'ERROR'
  const message = errorData?.message || error.message || 'An error occurred'
  const details = errorData?.details || null
  const timestamp = errorData?.timestamp || null

  return (
    <div
      ref={displayRef}
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-red-200 shadow-lg transition-opacity duration-[3000ms] ease-out',
        isFading ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
    >
      {/* Collapsed state - always visible */}
      <div className="flex items-center justify-between px-4 py-3 bg-red-50 border-b border-red-200">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-900 truncate">{message}</p>
            <p className="text-xs text-red-600">{code}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 rounded-md transition-colors"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Hide error details' : 'View error details'}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Hide
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                View Details
              </>
            )}
          </button>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="p-1.5 text-red-600 hover:bg-red-100 rounded-md transition-colors"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded state - error details */}
      {isExpanded && (
        <div className="px-4 py-3 bg-white">
          <div className="space-y-3">
            {/* Uneditable text box for full error details */}
            <div className="rounded-md border border-gray-300 bg-gray-50 p-3">
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono overflow-x-auto">
                {JSON.stringify({ code, message, details, timestamp }, null, 2)}
              </pre>
            </div>

            {/* Additional details if available */}
            {details && typeof details === 'object' && (
              <div className="text-xs text-gray-600">
                <p className="font-medium mb-1">Additional Information:</p>
                <ul className="list-disc list-inside space-y-1">
                  {Object.entries(details).map(([key, value]) => (
                    <li key={key}>
                      <span className="font-medium">{key}:</span>{' '}
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {timestamp && (
              <p className="text-xs text-gray-500">
                Timestamp: {new Date(timestamp).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
