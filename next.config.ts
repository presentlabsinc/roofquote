import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer ships its own React reconciler + native-ish modules
  // (PDFKit, fontkit) that break when bundled by Turbopack — symptom is the
  // PDF route 500-ing with "Cannot read properties of null (reading 'props')"
  // because the reconciler fails to commit the Document into the container.
  // Marking it external makes Next.js load it from node_modules at runtime
  // instead of bundling it through Turbopack.
  serverExternalPackages: ["@prisma/client", "@react-pdf/renderer"],
  experimental: {
    // Client router cache for dynamic pages — without this every tab tap /
    // back navigation refetches the full RSC payload (auth + DB roundtrips).
    // 30s staleness is fine for a single-user-per-account field app; forms
    // call router.refresh() after mutations which bypasses this cache.
    staleTimes: {
      dynamic: 30,
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "nujfomfygxqemrdhhotc.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
