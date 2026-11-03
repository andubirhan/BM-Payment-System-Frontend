import { useEffect, useRef } from 'react'

const MENU_REFRESH_EVENT = 'pos:menu-refresh'

export function dispatchMenuRefresh(path) {
  window.dispatchEvent(new CustomEvent(MENU_REFRESH_EVENT, { detail: { path } }))
}

export function useMenuRefresh(path, onRefresh) {
  const callbackRef = useRef(onRefresh)
  callbackRef.current = onRefresh

  useEffect(() => {
    const handleMenuRefresh = (event) => {
      if (event.detail?.path === path) callbackRef.current()
    }
    window.addEventListener(MENU_REFRESH_EVENT, handleMenuRefresh)
    return () => window.removeEventListener(MENU_REFRESH_EVENT, handleMenuRefresh)
  }, [path])
}
