import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production type checking excludes Vitest mocks; tests run separately via Vitest.
  typescript: { tsconfigPath: "tsconfig.app.json" },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "unsafe-none" },
        ],
      },
    ];
  },
};

export default nextConfig;
