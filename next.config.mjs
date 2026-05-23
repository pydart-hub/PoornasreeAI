/** @type {import('next').NextConfig} */

// In Docker the API is reachable via the service name "api".
// Locally, point to localhost:4000 by setting API_INTERNAL_URL in .env.local.
const API_HOST = process.env.API_INTERNAL_URL || "http://api:4000";

const nextConfig = {
  // ── API proxy rewrites ──────────────────────────────────────────────────
  async rewrites() {
    return [
      // API proxy — browser calls /api/* → Next.js server → API
      {
        source:      "/api/:path*",
        destination: `${API_HOST}/api/:path*`,
      },
      // Uploaded files (product images, logos, etc.)
      {
        source:      "/uploads/:path*",
        destination: `${API_HOST}/uploads/:path*`,
      },
      // Socket.IO proxy — polling + WebSocket upgrades
      {
        source:      "/socket.io",
        destination: `${API_HOST}/socket.io`,
      },
      {
        source:      "/socket.io/:path*",
        destination: `${API_HOST}/socket.io/:path*`,
      },
    ];
  },

  // Skip ESLint during production builds (run separately in CI)
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Disable webpack filesystem caching to avoid OneDrive symlink issues
  webpack: (config) => {
    config.cache = false;
    return config;
  },
};

export default nextConfig;
