import { Component } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled application render error:', error, errorInfo)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <section role="alert" className="w-full max-w-lg rounded-md border border-red-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-1 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Something went wrong</h1>
              <p className="mt-2 text-sm text-gray-600">The page encountered an unexpected error. Reload the app to try again.</p>
              <Button type="button" className="mt-4" onClick={() => window.location.reload()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Reload app
              </Button>
            </div>
          </div>
        </section>
      </main>
    )
  }
}