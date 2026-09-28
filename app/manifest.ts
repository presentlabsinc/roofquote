import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "지붕견적 - RoofQuote",
    short_name: "지붕견적",
    description: "현장에서 바로 쓰는 지붕공사 견적 도구",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f8fa",
    theme_color: "#2563eb",
    // PNG 아이콘 — 안드로이드 설치 요건(192·512)과 iOS 홈 화면(SVG 미지원) 때문에 추가 (2026-09-28).
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    categories: ["business", "productivity"],
    lang: "ko",
  };
}
