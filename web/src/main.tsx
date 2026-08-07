import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { queryClient } from '@/lib/query-client'
import { router } from './router'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/*
      `attribute="class"` to match `@custom-variant dark (&:is(.dark *))` in
      index.css — the variant keys off a class, so a provider writing
      `data-theme` would set a value nothing reads.

      `defaultTheme="system"` because the honest default is the one the person
      already chose at OS level; the toggle only overrides it on request.
    */}
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
