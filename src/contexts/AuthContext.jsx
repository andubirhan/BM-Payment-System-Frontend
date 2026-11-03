import { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, getApiErrorMessage, reportApiError } from '@/lib/apiError'

const AuthContext = createContext(null)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

const TOKEN_KEY = 'jwt_token'
const USER_KEY = 'user_info'

function isTokenUsable(token) {
  if (!token) return false
  try {
    const payload = token.split('.')[1]
    if (!payload) return false
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')))
    return Number.isFinite(claims.exp) && claims.exp * 1000 > Date.now() + 30000
  } catch {
    return false
  }
}

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem(USER_KEY)
    return saved ? JSON.parse(saved) : null
  })
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
  }, [token])

  useEffect(() => {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(USER_KEY)
    }
  }, [user])

  useEffect(() => {
    if (token && !isTokenUsable(token)) {
      setToken(null)
      setUser(null)
    }
  }, [token])

  useEffect(() => {
    const handleUnauthorized = () => {
      setToken(null)
      setUser(null)
      navigate('/login', { replace: true, state: { sessionExpired: true } })
    }
    window.addEventListener('pos-tax-vat:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('pos-tax-vat:unauthorized', handleUnauthorized)
  }, [navigate])

  const login = async (username, password) => {
    setLoading(true)
    try {
      let response
      try {
        response = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        })
      } catch (requestError) {
        throw reportApiError(requestError)
      }

      const responseText = await response.text()
      let data = null
      if (responseText.trim()) {
        try {
          data = JSON.parse(responseText)
        } catch (parseError) {
          if (response.ok) {
            throw new ApiError({
              message: 'The server returned an invalid login response. Please try again.',
              status: response.status,
              cause: parseError,
            })
          }
        }
      }

      if (!response.ok) {
        throw reportApiError({
          response: { status: response.status, data },
          isAxiosError: true,
        })
      }

      if (!data?.token) {
        throw new ApiError({ message: 'The server response did not include a login token.' })
      }
      setToken(data.token)
      setUser({ username: data.username, role: data.role })
      navigate('/')
      return { success: true }
    } catch (error) {
      return { success: false, error: getApiErrorMessage(error, 'Unable to sign in. Please try again.') }
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    navigate('/login')
  }

  const isAuthenticated = () => isTokenUsable(token)

  const hasRole = (requiredRole) => {
    if (!user) return false
    return user.role === requiredRole
  }

  const hasAnyRole = (roles) => {
    if (!user) return false
    return roles.includes(user.role)
  }

  const value = {
    token,
    user,
    loading,
    login,
    logout,
    isAuthenticated,
    hasRole,
    hasAnyRole
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
