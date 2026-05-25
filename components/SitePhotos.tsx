"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, X, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { PhotoItem } from "@/lib/types";

/**
 * Site detail photos block — display, fullscreen lightbox, add more, delete.
 *
 * Server-rendered SiteDetailPage hands us the initial photo list. We hold
 * a local copy for optimistic UI; every mutation (add/delete) PATCHes
 * `/api/sites/[id]` with the full new array and then calls router.refresh()
 * so other server-rendered parts of the page stay consistent.
 */
export function SitePhotos({ siteId, initialPhotos }: { siteId: string; initialPhotos: PhotoItem[] }) {
  const router = useRouter();
  const [photos, setPhotos] = useState<PhotoItem[]>(initialPhotos);
  const [uploading, setUploading] = useState(0);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  // Keep local state in sync if the server page refreshes with new data.
  useEffect(() => {
    setPhotos(initialPhotos);
  }, [initialPhotos]);

  // Lightbox keyboard nav (desktop convenience).
  useEffect(() => {
    if (lightboxIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxIdx(null);
      if (e.key === "ArrowLeft") setLightboxIdx((i) => (i === null ? null : Math.max(0, i - 1)));
      if (e.key === "ArrowRight") setLightboxIdx((i) => (i === null ? null : Math.min(photos.length - 1, i + 1)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIdx, photos.length]);

  async function persist(next: PhotoItem[]) {
    const res = await fetch(`/api/sites/${siteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photos: next }),
    });
    if (!res.ok) throw new Error("save failed");
    startTransition(() => router.refresh());
  }

  async function handleAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading((n) => n + files.length);
    const uploaded: PhotoItem[] = [];
    await Promise.all(
      files.map(async (file) => {
        const fd = new FormData();
        fd.append("file", file);
        try {
          const res = await fetch("/api/upload", { method: "POST", body: fd });
          if (!res.ok) throw new Error();
          const { url } = await res.json();
          uploaded.push({ url, memo: "" });
        } catch {
          toast.error(`${file.name} 업로드 실패`);
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
    if (uploaded.length === 0) return;
    const next = [...photos, ...uploaded];
    setPhotos(next); // optimistic
    try {
      await persist(next);
      toast.success(`${uploaded.length}장 추가됨`);
    } catch {
      setPhotos(photos); // rollback
      toast.error("저장 실패");
    }
  }

  async function handleDelete(idx: number) {
    const prev = photos;
    const next = photos.filter((_, i) => i !== idx);
    setPhotos(next); // optimistic
    setConfirmDeleteIdx(null);
    // If the deleted photo was open in the lightbox, close it (or move to a valid index).
    if (lightboxIdx !== null) {
      if (next.length === 0) setLightboxIdx(null);
      else if (lightboxIdx >= next.length) setLightboxIdx(next.length - 1);
    }
    try {
      await persist(next);
      toast.success("삭제됨");
    } catch {
      setPhotos(prev); // rollback
      toast.error("삭제 실패");
    }
  }

  const lightbox = lightboxIdx !== null ? photos[lightboxIdx] : null;

  return (
    <>
      <div className="bg-card rounded-2xl border border-border/60 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-foreground text-sm">
            현장 사진
            {photos.length > 0 && <span className="ml-1.5 text-xs text-muted-foreground font-normal">{photos.length}장</span>}
          </h2>
          <label className="flex items-center gap-1 text-xs font-semibold text-primary pressable cursor-pointer">
            <Camera size={14} />
            <span>{uploading > 0 ? `업로드 중... (${uploading})` : "추가"}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="hidden"
              onChange={handleAdd}
              disabled={uploading > 0}
            />
          </label>
        </div>

        {photos.length === 0 ? (
          <label className="flex flex-col items-center justify-center gap-1.5 h-24 border-2 border-dashed border-border rounded-xl text-muted-foreground text-xs cursor-pointer pressable">
            <Camera size={20} />
            <span>사진 추가 / 촬영</span>
            <input
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="hidden"
              onChange={handleAdd}
              disabled={uploading > 0}
            />
          </label>
        ) : (
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
            {photos.map((p, i) => (
              <div key={`${p.url}-${i}`} className="shrink-0 relative">
                <button
                  type="button"
                  onClick={() => setLightboxIdx(i)}
                  className="block pressable rounded-xl overflow-hidden"
                  aria-label={`사진 ${i + 1} 크게 보기`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.memo ?? ""}
                    className="w-24 h-24 object-cover border border-border/40"
                  />
                </button>
                {/* Delete chip — small, in the corner so it doesn't fight the main tap target. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteIdx(i);
                  }}
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-black/70 text-white grid place-items-center pressable"
                  aria-label="사진 삭제"
                >
                  <X size={13} strokeWidth={2.5} />
                </button>
                {p.memo && (
                  <p className="text-[11px] text-muted-foreground mt-1.5 w-24 truncate">{p.memo}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Lightbox ─── */}
      {lightbox && lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col"
          onClick={() => setLightboxIdx(null)}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between p-4 text-white text-sm">
            <span className="tabular-nums">{lightboxIdx + 1} / {photos.length}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteIdx(lightboxIdx);
                }}
                className="flex items-center gap-1 px-3 h-9 rounded-full bg-white/10 text-white text-xs font-semibold pressable"
                aria-label="이 사진 삭제"
              >
                <Trash2 size={14} />삭제
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIdx(null);
                }}
                className="w-9 h-9 rounded-full bg-white/10 grid place-items-center pressable"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Image */}
          <div className="flex-1 flex items-center justify-center px-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.url}
              alt={lightbox.memo ?? ""}
              className="max-h-full max-w-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Bottom bar — memo + prev/next */}
          <div className="p-4 text-white text-sm flex items-center justify-between gap-3" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLightboxIdx((i) => (i === null || i === 0 ? i : i - 1))}
              disabled={lightboxIdx === 0}
              className="w-10 h-10 rounded-full bg-white/10 grid place-items-center pressable disabled:opacity-30"
              aria-label="이전"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex-1 text-center text-xs text-white/70 truncate">
              {lightbox.memo || ""}
            </div>
            <button
              type="button"
              onClick={() => setLightboxIdx((i) => (i === null || i >= photos.length - 1 ? i : i + 1))}
              disabled={lightboxIdx >= photos.length - 1}
              className="w-10 h-10 rounded-full bg-white/10 grid place-items-center pressable disabled:opacity-30"
              aria-label="다음"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      )}

      {/* ─── Delete confirmation ─── */}
      {confirmDeleteIdx !== null && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 grid place-items-center p-4"
          onClick={() => setConfirmDeleteIdx(null)}
        >
          <div
            className="w-full max-w-xs bg-card rounded-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <p className="font-bold text-foreground">사진을 삭제할까요?</p>
              <p className="text-xs text-muted-foreground mt-1">이 작업은 되돌릴 수 없습니다.</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteIdx(null)}
                className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold pressable"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => confirmDeleteIdx !== null && handleDelete(confirmDeleteIdx)}
                className="flex-1 h-11 rounded-xl bg-red-500 text-white text-sm font-semibold pressable"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
