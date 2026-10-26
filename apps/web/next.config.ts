import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@postline/core", "@postline/db", "@postline/integrations", "@postline/ai"],
  serverExternalPackages: ["@prisma/client", "bullmq", "ioredis"],
  experimental: {
    optimizePackageImports: ["@mantine/core", "@mantine/hooks", "@tabler/icons-react"],
  },
};

export default config;
