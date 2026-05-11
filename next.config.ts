import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // !! 警告 !!
    // プロジェクトに型エラーがあっても、ビルドを強制的に完了させます。
    ignoreBuildErrors: true,
  },
  eslint: {
    // ESLintのエラーがあってもビルドを強制的に完了させます。
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
