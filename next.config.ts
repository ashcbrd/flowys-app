import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The brand kit reads the mockup scene photos off the filesystem at run
  // time. Vercel's function bundler only traces imports, so without this the
  // scenes exist as static files but not inside the function that composites
  // onto them, and the failure only shows in production.
  outputFileTracingIncludes: {
    "/api/workflows/**": ["./public/mockups/**"],
    "/api/nodes/**": ["./public/mockups/**"],
    "/api/apps/**": ["./public/mockups/**"],
    "/api/v1/**": ["./public/mockups/**"],
  },
};

export default nextConfig;
