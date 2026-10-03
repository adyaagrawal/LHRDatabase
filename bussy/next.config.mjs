/** @type {import('next').NextConfig} */
const nextConfig = {
  // ExcelJS is a Node library; keep it out of the server bundle so it loads natively.
  serverExternalPackages: ["exceljs"],
  experimental: {
    serverActions: {
      // The admin "Import Microsoft Forms export" upload goes through a server action.
      // Vercel caps request bodies at 4.5 MB, so stay just under that.
      bodySizeLimit: "4mb",
    },
  },
  eslint: {
    // Lint runs locally / in CI with `pnpm lint`; a lint warning should never block a deploy.
    ignoreDuringBuilds: true,
  },
  poweredByHeader: false,
};

export default nextConfig;
