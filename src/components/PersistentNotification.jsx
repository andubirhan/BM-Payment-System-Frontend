import { useState, useEffect } from 'react'
import { X, AlertCircle, CheckCircle2, Info } from 'lucide-react'

export default function PersistentNotification({ type = 'info', message, onClose, duration = null }) {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (duration && duration > 0) {
      const fadeTimer = setTimeout(() => {
        setFading(true)
      }, Math.max(0, duration - 500))
      const closeTimer = setTimeout(() => {
        setVisible(false)
        if (onClose) onClose()
      }, duration)
      return () => {
        clearTimeout(fadeTimer)
        clearTimeout(closeTimer)
      }
    }
  }, [duration, onClose])

  const handleClose = () => {
    setVisible(false)
    if (onClose) onClose()
  }

  if (!visible) return null

  const typeStyles = {
    error: {
      container: 'border-red-300 bg-red-50 text-red-900',
      icon: AlertCircle,
      iconColor: 'text-red-600'
    },
    warning: {
      container: 'border-amber-300 bg-amber-50 text-amber-900',
      icon: AlertCircle,
      iconColor: 'text-amber-600'
    },
    success: {
      container: 'border-green-300 bg-green-50 text-green-900',
      icon: CheckCircle2,
      iconColor: 'text-green-600'
    },
    info: {
      container: 'border-blue-300 bg-blue-50 text-blue-900',
      icon: Info,
      iconColor: 'text-blue-600'
    }
  }

  const style = typeStyles[type] || typeStyles.info
  const Icon = style.icon

  return (
    <div className={`fixed top-4 right-4 z-50 max-w-md rounded-lg border p-4 shadow-lg transition-all duration-500 ease-out ${style.container} ${fading ? '-translate-y-2 opacity-0' : 'translate-y-0 opacity-100'}`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.iconColor}`} aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm font-medium">{message}</p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="shrink-0 rounded-md p-1 hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-black/20"
          aria-label="Close notification"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
