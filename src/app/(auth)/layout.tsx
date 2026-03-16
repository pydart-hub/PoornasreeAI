import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="dark min-h-[100dvh] flex items-center justify-center relative overflow-hidden px-4 py-6 sm:py-8"
      style={{ colorScheme: "dark", background: "linear-gradient(135deg, #020d1a 0%, #041525 40%, #061a10 100%)" }}
    >

      {/* Radial color blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div style={{ position:"absolute", top:"-10%", left:"-10%", width:"55%", height:"55%", borderRadius:"50%", background:"radial-gradient(circle, rgba(43,95,158,0.18) 0%, transparent 70%)", filter:"blur(60px)" }} />
        <div style={{ position:"absolute", bottom:"-10%", right:"-5%", width:"50%", height:"50%", borderRadius:"50%", background:"radial-gradient(circle, rgba(17,80,20,0.15) 0%, transparent 70%)", filter:"blur(60px)" }} />
        <div style={{ position:"absolute", top:"40%", right:"20%", width:"30%", height:"30%", borderRadius:"50%", background:"radial-gradient(circle, rgba(156,203,59,0.06) 0%, transparent 70%)", filter:"blur(50px)" }} />
      </div>

      {/* Large decorative flower — right side watermark */}
      <div className="absolute right-[-8%] top-1/2 -translate-y-1/2 w-[520px] h-[520px] sm:w-[680px] sm:h-[680px] pointer-events-none select-none opacity-[0.055]">
        <Image src="/flower.png" alt="" fill className="object-contain" />
      </div>

      {/* Top-left small accent flower */}
      <div className="absolute top-[-60px] left-[-60px] w-[240px] h-[240px] pointer-events-none select-none opacity-[0.04] rotate-45">
        <Image src="/flower.png" alt="" fill className="object-contain" />
      </div>

      {/* Subtle dot-grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(rgba(43,95,158,0.12) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          opacity: 0.6,
        }}
      />

      {/* Centered card */}
      <div className="relative z-10 w-full max-w-[420px]">

        {/* Glass card */}
        <div
          className="relative rounded-3xl border border-white/[0.07] overflow-hidden px-6 sm:px-10 py-8 sm:py-10"
          style={{
            background: "linear-gradient(160deg, rgba(10,24,48,0.92) 0%, rgba(5,14,28,0.96) 100%)",
            backdropFilter: "blur(24px)",
            boxShadow: "0 32px 80px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          {/* Top inner shimmer line */}
          <div className="absolute top-0 left-[15%] right-[15%] h-[1px] bg-gradient-to-r from-transparent via-[#2B5F9E]/50 to-transparent" />

          {children}
        </div>

        {/* Footer */}
        <div className="mt-7 text-center">
          <p className="text-[10px] text-white/20 tracking-wider">
            &copy; 2025 Pydart Intellicom Pvt. Ltd.
          </p>
        </div>
      </div>
    </div>
  );
}
