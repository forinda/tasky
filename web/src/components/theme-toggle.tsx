import { MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'

/**
 * Two visible states, three real ones.
 *
 * The stored preference starts as `system` and only becomes explicit once
 * someone presses this. Toggling reads `resolvedTheme` — the theme actually on
 * screen — rather than `theme`, so the first press from `system` always flips
 * what the user is looking at instead of appearing to do nothing.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <Button
      variant="ghost"
      size="sm"
      // The label says what pressing it does, not what the current state is —
      // a button named "Dark" is ambiguous about which way it goes.
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
    </Button>
  )
}
