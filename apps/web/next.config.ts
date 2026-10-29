import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@postline/core", "@postline/db", "@postline/integrations", "@postline/ai"],
  serverExternalPackages: ["@prisma/client", "bullmq", "ioredis"],
  experimental: {
    optimizePackageImports: ["@mantine/core", "@mantine/hooks", "@tabler/icons-react"],
  },
  webpack: (config) => {
    // Konva's Node entry optionally requires the native `canvas` package; the Studio only renders in the browser.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

export default config;
