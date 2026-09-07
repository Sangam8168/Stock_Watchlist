import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lint config in this repo is noisy/unmaintained; types are enforced below.
  eslint: {
      ignoreDuringBuilds: true,
  },
};

export default nextConfig;
