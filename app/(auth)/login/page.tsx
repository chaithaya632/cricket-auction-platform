import type { Metadata } from "next"
import Image from "next/image"
import { AccBrandingPanel } from "@/components/acc/branding-panel"
import { LoginForm } from "@/components/acc/auth/login-form"

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the Avanthi Cricket Carnival auction portal.",
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-svh w-full flex-col items-center justify-center overflow-x-hidden px-4 py-10 sm:px-6 sm:py-12">
      {/* FULL-SCREEN CRICKET STADIUM BACKGROUND */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('/images/cricket-hero-bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <Image
          src="/images/cricket-hero-bg.png"
          alt="Avanthi Cricket Carnival Stadium"
          fill
          priority
          unoptimized
          sizes="100vw"
          className="object-cover object-center"
        />
        {/* Controlled Dark Readability Overlay — keeps stadium, floodlights & field clearly visible */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/45 to-black/75" />
      </div>

      {/* CENTERED BRANDING + LOGIN CARD + FOOTER */}
      <AccBrandingPanel
        title={
          <>
            Avanthi Cricket <span className="text-amber-400">Carnival</span>
          </>
        }
      >
        <LoginForm />
      </AccBrandingPanel>
    </main>
  )
}
