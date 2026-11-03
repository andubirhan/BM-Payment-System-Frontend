import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function ProtectedRoute({ children, requiredRoles = [] }) {
  const { token, isAuthenticated, hasAnyRole } = useAuth()

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ sessionExpired: Boolean(token) }} />
  }

  if (requiredRoles.length > 0 && !hasAnyRole(requiredRoles)) {
    return <Navigate to="/" replace />
  }

  return children
}
