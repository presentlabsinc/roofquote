/** Content-Disposition 파일명 — 한글은 RFC 5987(filename*)로, ASCII 폴백도 함께. */
export function contentDisposition(kind: "inline" | "attachment", koreanName: string, asciiName: string): string {
  const ascii = asciiName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(koreanName)}`;
}

/** 파일명에 못 쓰는 글자를 공백으로 — 비면 폴백. */
export function safeFileNamePart(s: string | null | undefined, fallback: string): string {
  return (s ?? "").replace(/[\\/:*?"<>|\r\n]+/g, " ").trim() || fallback;
}
