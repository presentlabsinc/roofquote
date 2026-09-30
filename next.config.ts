import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer ships its own React reconciler + native-ish modules
  // (PDFKit, fontkit) that break when bundled by Turbopack — symptom is the
  // PDF route 500-ing with "Cannot read properties of null (reading 'props')"
  // because the reconciler fails to commit the Document into the container.
  // Marking it external makes Next.js load it from node_modules at runtime
  // instead of bundling it through Turbopack.
  serverExternalPackages: ["@prisma/client", "@react-pdf/renderer"],
  // PDF 폰트는 런타임에 fs 경로로 읽혀서 자동 추적에 안 잡힌다 — PDF 라우트 함수에 명시적으로 포함.
  // (components/EstimatePDF.tsx pretendardSrc). 키는 라우트 경로 glob, 값은 프로젝트 루트 기준 glob.
  outputFileTracingIncludes: {
    "/api/estimates/*/pdf": ["./assets/fonts/**/*"],
  },
  experimental: {
    // Client router cache for dynamic pages — without this every tab tap /
    // back navigation refetches the full RSC payload (auth + DB roundtrips).
    // 30s staleness is fine for a single-user-per-account field app; forms
    // call router.refresh() after mutations which bypasses this cache.
    staleTimes: {
      dynamic: 30,
    },
  },
  // 기본 보안 헤더 (2026-09-28). CSP 는 인라인 스크립트·외부 폰트 정리 후 별도로.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 미리보기 iframe 은 같은 출처(PDF API)라 SAMEORIGIN 으로 충분 — 다른 사이트가 앱을 틀에 넣는 것만 차단.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  // images.remotePatterns 제거 (2026-09-28): 앱은 next/image 를 쓰지 않고 <img> 로 렌더한다.
  // 공개 버킷을 허용 목록에 두면 /_next/image 가 인증 없이 우리 버킷 파일을 sharp 로 처리해
  // 이미지 최적화 취약점(AVIF RCE 등)의 입구가 된다. next/image 를 도입할 때만 다시 추가.
};

export default nextConfig;
