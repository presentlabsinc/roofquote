// 빌드 진입점 (2026-09-28) — Vercel 대시보드의 Build Command 설정과 무관하게 한 곳에서 결정한다.
//
// - Vercel production 배포: prisma migrate deploy (운영 DB 스키마 적용) → next build
// - 그 외 (Vercel 프리뷰 · 로컬 · CI): next build 만 — 프리뷰나 로컬 빌드가 운영 DB 스키마를 바꾸지 않게.
//   (로컬 .env 는 운영 DB 를 가리킨다. 이전 build 스크립트는 로컬 빌드마다 운영 DB 에 migrate 했다.)
//
// migrate 가 실패하면 빌드도 실패한다 — 스키마 없이 새 코드만 배포돼 전 화면이 500 나는 일을 막는다.
import { execSync } from "node:child_process";

const env = process.env.VERCEL_ENV;
if (env === "production") {
  console.log("[build] VERCEL_ENV=production → prisma migrate deploy");
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} else {
  console.log(`[build] VERCEL_ENV=${env ?? "(none)"} → migrate 건너뜀 (production 배포에서만 실행)`);
}
execSync("npx next build", { stdio: "inherit" });
