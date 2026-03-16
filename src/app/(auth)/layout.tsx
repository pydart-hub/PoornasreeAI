import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center relative overflow-hidden bg-[#020a18] px-3 sm:px-4 py-6 sm:py-8">

      {/* Animated mesh gradient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_#0f2847_0%,_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_#0a1f0a_0%,_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#0a1832_0%,_transparent_70%)]" />
      </div>

      {/* Animated glow orbs */}
      <div className="absolute top-[-60px] left-[-60px] sm:top-[-120px] sm:left-[-120px] w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] rounded-full bg-[#2B5F9E]/15 blur-[80px] sm:blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-[-60px] right-[-60px] sm:bottom-[-120px] sm:right-[-120px] w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] rounded-full bg-[#9CCB3B]/8 blur-[80px] sm:blur-[120px] pointer-events-none animate-pulse [animation-delay:1.5s]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] sm:w-[600px] sm:h-[600px] rounded-full bg-[#1a3a6e]/10 blur-[100px] sm:blur-[150px] pointer-events-none" />

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(rgba(43,95,158,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(43,95,158,0.3) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Subtle flower watermark */}
      <div className="absolute inset-0 pointer-events-none select-none opacity-[0.03]">
        <Image src="/flower.png" alt="" fill className="object-cover" />
      </div>

      {/* Centered card */}
      <div className="relative z-10 w-full max-w-[430px]">

        {/* Card with layered borders and glow */}
        <div className="relative group">
          {/* Outer glow ring */}
          <div className="absolute -inset-[1px] rounded-[26px] bg-gradient-to-b from-[#2B5F9E]/30 via-[#1a3260]/20 to-[#9CCB3B]/10 blur-sm" />

          {/* Main card */}
          <div className="relative rounded-2xl sm:rounded-3xl bg-gradient-to-b from-[#0a1829] to-[#060e1c] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] border border-[#1a3260]/50 px-5 sm:px-9 py-7 sm:py-9 overflow-hidden">
            {/* Inner top highlight */}
            <div className="absolute top-0 left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-transparent via-[#2B5F9E]/40 to-transparent" />
            {children}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-[10px] text-[#1e3a5e] tracking-wider font-medium">
            &copy; 2025 Pydart Intellicom Pvt. Ltd.
          </p>
        </div>
      </div>
    </div>
  );
}
