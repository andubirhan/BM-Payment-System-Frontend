import { createContext, useContext, useState, useEffect } from 'react'

const ErrorContext = createContext(null)

export function ErrorProvider({ children }) {
  const [error, setError] = useState(null)

  const showError = (error) => {
    setError(error)
  }

  const clearError = () => {
    setError(null)
  }

  useEffect(() => {
    const handleGlobalError = (event) => {
      showError(event.detail)
    }

    window.addEventListener('pos-tax-vat:error', handleGlobalError)
    return () => window.removeEventListener('pos-tax-vat:error', handleGlobalError)
  }, [])

  return (
    <ErrorContext.Provider value={{ error, showError, clearError }}>
      {children}
    </ErrorContext.Provider>
  )
}

export function useError() {
  const context = useContext(ErrorContext)
  if (!context) {
    throw new Error('useError must be used within an ErrorProvider')
  }
  return context
}
