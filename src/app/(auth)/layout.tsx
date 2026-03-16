import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="dark min-h-[100dvh] flex items-center justify-center relative overflow-hidden md:px-6 md:py-6"
      style={{ colorScheme: "dark", background: "linear-gradient(135deg, #020d1a 0%, #041525 40%, #061a10 100%)" }}
    >
      {/* Dot-grid overlay — desktop only */}
      <div
        className="hidden md:block absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(rgba(43,95,158,0.12) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          opacity: 0.5,
        }}
      />

      {/* Desktop card wrapper */}
      <div
        className="hidden md:block relative z-10 w-full max-w-[1100px] rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 40px 100px -20px rgba(0,0,0,0.8)" }}
      >
        {children}
      </div>

      {/* Mobile — full screen, no card */}
      <div className="md:hidden w-full min-h-[100dvh] flex flex-col">
        {children}
      </div>

      {/* Footer — desktop only */}
      <div className="hidden md:block absolute bottom-3 left-0 right-0 text-center">
        <p className="text-[10px] text-white/20 tracking-wider">
          &copy; 2025 Pydart Intellicom Pvt. Ltd.
        </p>
      </div>
    </div>
  );
}
