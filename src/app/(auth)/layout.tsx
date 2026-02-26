"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Logo } from "@/components/ui";

const SLIDES = [
  {
    src: "/images/Gemini_Generated_Image_985s4l985s4l985s.webp",
    eyebrow: "Smart Diagnostics",
    heading: "Troubleshoot",
    highlight: "instantly.",
  },
  {
    src: "/images/Gemini_Generated_Image_g2f0nog2f0nog2f0.webp",
    eyebrow: "24 / 7  Available",
    heading: "Always on,",
    highlight: "always accurate.",
  },
  {
    src: "/images/Gemini_Generated_Image_onche6onche6onch.webp",
    eyebrow: "Multi-Language Support",
    heading: "Your language,",
    highlight: "your way.",
  },
];

const INTERVAL = 8000;

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [current, setCurrent] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      const nextIdx = (current + 1) % SLIDES.length;
      setNext(nextIdx);
      setTransitioning(true);
      setTimeout(() => {
        setCurrent(nextIdx);
        setNext(null);
        setTransitioning(false);
      }, 1400);
    }, INTERVAL);
    return () => clearInterval(timer);
  }, [current]);

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden">

      {/* ── Full-page background slideshow ── */}
      <Image
        key={`curr-${current}`}
        src={SLIDES[current].src}
        alt=""
        fill
        className="object-cover object-center transition-opacity duration-[1400ms] ease-in-out"
        style={{ opacity: transitioning ? 0 : 1 }}
        priority
      />
      {next !== null && (
        <Image
          key={`next-${next}`}
          src={SLIDES[next].src}
          alt=""
          fill
          className="object-cover object-center transition-opacity duration-[1400ms] ease-in-out"
          style={{ opacity: transitioning ? 1 : 0 }}
          priority
        />
      )}

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/35" />

      {/* ── Page layout ── */}
      <div className="relative z-10 w-full min-h-screen flex flex-col lg:flex-row">

        {/* ── Left: Branding — text fixed at bottom, synced with images ── */}
        <div className="hidden lg:flex flex-1 flex-col justify-between p-10 xl:p-14">

          {/* Top: Logo */}
          <div className="inline-block p-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 self-start">
            <Logo variant="full" size="md" />
          </div>

          {/* Bottom: Per-slide text + dots */}
          <div className="space-y-6">
            {/* Text container — fixed height, crossfade in place */}
            <div className="relative h-24">
              {SLIDES.map((slide, i) => (
                <div
                  key={i}
                  className={`absolute inset-0 flex flex-col gap-2 transition-all duration-700 ease-out ${
                    i === current
                      ? "opacity-100 translate-y-0"
                      : "opacity-0 translate-y-3 pointer-events-none"
                  }`}
                >
                  <p className="text-xs font-bold tracking-[0.25em] uppercase text-white/50">
                    {slide.eyebrow}
                  </p>
                  <h2 className="text-3xl xl:text-4xl font-light text-white leading-snug">
                    {slide.heading}{" "}
                    <span className="font-semibold text-accent-300">{slide.highlight}</span>
                  </h2>
                </div>
              ))}
            </div>

            {/* Slide dots */}
            <div className="flex gap-2 items-center">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  aria-label={`Slide ${i + 1}`}
                  className={`rounded-full transition-all duration-500 ${
                    i === current
                      ? "w-6 h-1.5 bg-white"
                      : "w-1.5 h-1.5 bg-white/30 hover:bg-white/60"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: Auth form — full height, right-aligned ── */}
        <div className="lg:w-[420px] xl:w-[460px] min-h-screen flex flex-col bg-white/40 dark:bg-gray-900/40 backdrop-blur-xl lg:border-l border-white/15 dark:border-white/10 shadow-2xl">

          {/* Form — vertically centered */}
          <div className="flex-1 flex items-center justify-center px-8 sm:px-10">
            <div className="w-full max-w-[380px]">
              {/* Mobile logo — aligned with form content */}
              <div className="mb-6 lg:hidden">
                <Logo variant="full" size="md" />
              </div>
              {children}
            </div>
          </div>

          {/* Bottom: Logo */}
          <div className="flex justify-center pb-8 pt-4">
            <Logo variant="full" size="sm" />
          </div>
        </div>
      </div>
    </div>
  );
}
