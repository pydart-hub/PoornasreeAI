import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark min-h-[100dvh] flex items-center justify-center relative overflow-hidden bg-[#020a18] px-4 py-6 sm:py-8" style={{ colorScheme: "dark" }}>

      {/* Full-screen flower background */}
      <div className="absolute inset-0">
        <Image
          src="/flower.png"
          alt=""
          fill
          className="object-cover"
          priority
          quality={90}
        />
      </div>

      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-[#041225]/75" />

      {/* Subtle gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#020a18]/60 via-transparent to-[#020a18]/70 pointer-events-none" />

      {/* Centered content */}
      <div className="relative z-10 w-full max-w-[440px]">
        {children}

        {/* Footer */}
        <div className="mt-8 sm:mt-10 text-center">
          <p className="text-[10px] text-white/25 tracking-wider font-medium">
            &copy; 2025 Pydart Intellicom Pvt. Ltd.
          </p>
        </div>
      </div>
    </div>
  );
}
