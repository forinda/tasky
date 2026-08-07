import { Nav } from '@/components/landing/nav'
import { Footer } from '@/components/landing/footer'
import { Hero } from '@/components/landing/hero'
import { Features } from '@/components/landing/features'
import { Showcase } from '@/components/landing/showcase'
import { CtaBand } from '@/components/landing/cta-band'

export function Landing() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Nav />
      <main>
        <Hero />
        <Features />
        <Showcase />
        <CtaBand />
      </main>
      <Footer />
    </div>
  )
}
