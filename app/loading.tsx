/**
 * Root loading UI — shown instantly when navigating to any nested route
 * while the server-rendered page is being prepared. Without this, the
 * previous page just sits there until the new HTML arrives, which feels
 * unresponsive on mobile (especially with cold-start latency on Hobby tier).
 *
 * Pretendard font + same background as the app shell so the spinner
 * doesn't look like a separate screen.
 */
export default function Loading() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
      <div className="w-9 h-9 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      <p className="text-xs text-muted-foreground tabular-nums">불러오는 중...</p>
    </div>
  );
}
