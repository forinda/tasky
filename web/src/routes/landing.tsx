import { Nav } from '@/components/landing/nav'
import { Footer } from '@/components/landing/footer'
import { Hero } from '@/components/landing/hero'

export function Landing() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Nav />
      <main>
        <Hero />
        {/* Features, showcase, and the closing band land in Task 3. */}
      </main>
      <Footer />
    </div>
  )
}
