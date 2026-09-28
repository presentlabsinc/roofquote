"use client"; // Error boundaries must be Client Components

/**
 * 루트 레이아웃까지 실패했을 때의 최후 화면 — 자체 <html>/<body>, 전역 CSS 없음 (인라인 스타일).
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", background: "#f7f8fa", color: "#1a1a1a" }}>
        <title>오류 — 지붕견적</title>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 360, width: "100%", textAlign: "center" }}>
            <p style={{ fontSize: 36, margin: "0 0 12px" }}>⚠️</p>
            <h1 style={{ fontSize: 18, margin: 0 }}>앱을 불러오지 못했어요</h1>
            <p style={{ fontSize: 14, color: "#666", marginTop: 8 }}>잠시 후 다시 시도해 주세요.</p>
            {error.digest && <p style={{ fontSize: 11, color: "#999", marginTop: 8 }}>오류 코드 {error.digest}</p>}
            <button
              type="button"
              onClick={() => retry()}
              style={{ marginTop: 24, width: "100%", height: 48, border: 0, borderRadius: 16, background: "#2563eb", color: "#fff", fontSize: 14, fontWeight: 600 }}
            >
              다시 시도
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
