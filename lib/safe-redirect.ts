/**
 * 로그인 후 돌아갈 `next` 경로 검증 — 같은 사이트 내부 경로만 허용 (오픈 리다이렉트 차단).
 *
 * `"/foo".startsWith("/")` 만 보면 `//evil.com`(프로토콜 상대 URL)과 `/\evil.com`(브라우저가
 * `\` 를 `/` 로 해석)이 통과해 외부로 나간다. 또 `/.//evil.com`, `/a/..//evil.com`, `/%2e//evil.com`
 * 처럼 점 세그먼트를 끼우면 URL 정규화 뒤에 `//evil.com` 이 된다 (2026-09-28 리뷰에서 발견) —
 * 그래서 **정규화된 결과를 다시** 검사한다.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  try {
    const base = "https://app.invalid";
    const u = new URL(next, base);
    if (u.origin !== base) return "/";
    const out = u.pathname + u.search + u.hash;
    // 정규화 후에도 반드시 '/<문자>' 로 시작해야 한다 ('//' 나 '/\' 는 외부 URL 로 해석됨).
    if (!out.startsWith("/") || out.startsWith("//") || out.startsWith("/\\")) return "/";
    return out;
  } catch {
    return "/";
  }
}
