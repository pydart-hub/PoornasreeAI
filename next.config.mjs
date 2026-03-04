/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── API proxy rewrites ──────────────────────────────────────────────────
  // Browser calls /api/* → Next.js server → API container (server-to-server).
  // This means NEXT_PUBLIC_API_URL does NOT need to be a build-time arg for
  // Docker deployments; the internal Docker service name is only ever used
  // server-side (never embedded in the client bundle).
  async rewrites() {
    const apiBase =
      process.env.API_INTERNAL_URL ||
      (process.env.NODE_ENV === "production"
        ? "http://api:4000"
        : "http://localhost:4000");

    return [
      {
        source: "/api/:path*",
        destination: `${apiBase}/api/:path*`,
      },
    ];
  },

  // Disable webpack filesystem caching to avoid OneDrive symlink issues
  webpack: (config) => {
    config.cache = false;
    return config;
  },
};

export default nextConfig;
