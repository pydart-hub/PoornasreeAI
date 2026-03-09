/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── API proxy rewrites ──────────────────────────────────────────────────
  // Browser calls /api/* → Next.js server → API container (server-to-server).
  // Static destination uses the Docker service name "api" — no env var logic
  // that could silently fall back to localhost inside the container.
  async rewrites() {
    return [
      // API proxy — browser calls /api/* → Next.js → API container
      {
        source:      "/api/:path*",
        destination: "http://api:4000/api/:path*",
      },
      // Socket.IO proxy — polling + WebSocket upgrades
      {
        source:      "/socket.io",
        destination: "http://api:4000/socket.io",
      },
      {
        source:      "/socket.io/:path*",
        destination: "http://api:4000/socket.io/:path*",
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
