import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">

      {/* ── Left: Static branding panel ── */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-[#0c2147] via-[#2B5F9E] to-[#163d12]">

        {/* Flower — full-panel subtle tint */}
        <div className="absolute inset-0 pointer-events-none select-none opacity-[0.07]">
          <Image src="/flower.png" alt="" fill className="object-cover" />
        </div>

        {/* Flower — large decorative bottom-right */}
        <div className="absolute -bottom-16 -right-16 w-80 h-80 pointer-events-none select-none opacity-[0.18]">
          <Image src="/flower.png" alt="" fill className="object-contain" />
        </div>

        {/* Flower — small decorative top-left */}
        <div className="absolute -top-10 -left-10 w-48 h-48 pointer-events-none select-none opacity-10 rotate-180">
          <Image src="/flower.png" alt="" fill className="object-contain" />
        </div>

        {/* Main content */}
        <div className="relative z-10 flex flex-col items-center gap-9 max-w-[380px] text-center px-8">

          {/* Logo card */}
          <div className="rounded-3xl bg-white/15 backdrop-blur-md border border-white/20 px-10 py-7">
            <div className="relative w-56 h-16 xl:w-64 xl:h-20">
              <Image
                src="/fulllogo.png"
                alt="Poornasree AI"
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>

          {/* Separator */}
          <div className="flex items-center gap-3 w-full">
            <div className="h-px flex-1 bg-white/25" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#9CCB3B]" />
            <div className="h-px flex-1 bg-white/25" />
          </div>

          {/* Tagline */}
          <div className="space-y-4">
            <p className="text-[10px] font-black tracking-[0.35em] uppercase text-[#9CCB3B]">
              AI‑Powered Support Portal
            </p>
            <h2 className="text-3xl xl:text-4xl font-extrabold text-white leading-tight">
              Smarter diagnostics,{" "}
              <span className="italic text-[#9CCB3B] drop-shadow-[0_2px_12px_rgba(156,203,59,0.5)]">
                faster solutions.
              </span>
            </h2>
            <p className="text-sm text-white/60 leading-relaxed">
              Built for Pydart field engineers. Instant troubleshooting
              guidance powered by machine learning.
            </p>
          </div>

          {/* Feature bullets */}
          <div className="w-full space-y-3 text-left">
            {[
              "Instant AI diagnostics",
              "Role‑based secure access",
              "Live support chat",
            ].map((f) => (
              <div key={f} className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-2.5 border border-white/10">
                <span className="w-1.5 h-1.5 rounded-full bg-[#9CCB3B] shrink-0" />
                <span className="text-sm text-white/80 font-medium">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right: Auth form ── */}
      <div className="w-full lg:w-[440px] xl:w-[480px] min-h-screen flex flex-col bg-white dark:bg-gray-950 shadow-2xl overflow-y-auto">

        {/* Mobile logo — gradient header strip */}
        <div className="lg:hidden flex flex-col items-center pt-8 pb-5 px-6 bg-gradient-to-b from-[#0c2147]/[0.06] to-transparent">
          <div className="relative w-44 h-12 sm:w-52 sm:h-14">
            <Image src="/fulllogo.png" alt="Poornasree AI" fill className="object-contain" priority />
          </div>
          <p className="mt-2 text-[9px] font-bold tracking-[0.3em] uppercase text-[#2B5F9E]/70">AI‑Powered Support Portal</p>
        </div>

        {/* Form — vertically centered */}
        <div className="flex-1 flex items-center justify-center px-5 sm:px-8 lg:px-10 py-4">
          <div className="w-full">
            {children}
          </div>
        </div>

        {/* Footer */}
        <div className="pb-6 text-center">
          <p className="text-[10px] text-gray-400 tracking-wide">
            © 2025 Pydart Intellicom Pvt. Ltd.
          </p>
        </div>
      </div>
    </div>
  );
}
