import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-[#0c2147] via-[#2B5F9E] to-[#163d12] px-4 py-8">

      {/* ── Background decorations ── */}
      <div className="absolute inset-0 pointer-events-none select-none opacity-[0.07]">
        <Image src="/flower.png" alt="" fill className="object-cover" />
      </div>
      <div className="absolute -bottom-16 -right-16 w-80 h-80 pointer-events-none select-none opacity-[0.12]">
        <Image src="/flower.png" alt="" fill className="object-contain" />
      </div>
      <div className="absolute -top-10 -left-10 w-48 h-48 pointer-events-none select-none opacity-10 rotate-180">
        <Image src="/flower.png" alt="" fill className="object-contain" />
      </div>

      {/* ── Centered card ── */}
      <div className="relative z-10 w-full max-w-md">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative w-52 h-14 sm:w-64 sm:h-16">
            <Image src="/fulllogo.png" alt="Poornasree AI" fill className="object-contain" priority />
          </div>
          <p className="mt-3 text-[10px] font-black tracking-[0.3em] uppercase text-[#9CCB3B]">
            AI‑Powered Support Portal
          </p>
        </div>

        {/* Glass card containing the form */}
        <div className="rounded-3xl bg-white/95 dark:bg-gray-950/95 backdrop-blur-xl shadow-2xl border border-white/20 px-6 sm:px-8 py-8">
          {children}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-[10px] text-white/40 tracking-wide">
            © 2025 Pydart Intellicom Pvt. Ltd.
          </p>
        </div>
      </div>
    </div>
  );
}
