import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, CircleAlert, Info, X } from 'lucide-react'

export default function Notification({ type = 'success', message, duration = 3000, onClose }) {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      setFading(true)
    }, duration - 500)

    const closeTimer = setTimeout(() => {
      setVisible(false)
      onClose?.()
    }, duration)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(closeTimer)
    }
  }, [duration, onClose])

  if (!visible) return null

  const notificationStyles = {
    success: { background: 'bg-emerald-600', Icon: CheckCircle2 },
    error: { background: 'bg-rose-600', Icon: CircleAlert },
    warning: { background: 'bg-amber-500', Icon: AlertCircle },
    info: { background: 'bg-blue-600', Icon: Info },
  }
  const style = notificationStyles[type] || notificationStyles.success
  const Icon = style.Icon

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition-opacity duration-500 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
      role="alert"
    >
      <div
        className={`mx-4 flex items-center gap-4 rounded-xl ${style.background} px-6 py-4 shadow-2xl text-white transition-all duration-500 ${
          fading ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        <Icon className="h-6 w-6 flex-shrink-0" />
        <p className="text-lg font-semibold">{message}</p>
        <button
          onClick={() => {
            setVisible(false)
            onClose?.()
          }}
          className="ml-2 flex-shrink-0 rounded-full p-1 hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
