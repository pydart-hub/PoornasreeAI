/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable webpack filesystem caching to avoid OneDrive symlink issues
  webpack: (config) => {
    config.cache = false;
    return config;
  },
};

export default nextConfig;
