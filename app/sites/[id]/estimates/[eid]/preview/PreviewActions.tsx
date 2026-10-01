"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Copy, FileText, Share2 } from "lucide-react";
import { recordSentPdf, sentRecordNotice } from "@/lib/sent-pdf-client";

interface Props {
  estimateId: string;
  siteId: string;
  customerName: string;
  summaryText: string;
  detailLevel: "simple" | "detailed";
}

type PdfCache = { level: "simple" | "detailed"; file: File };

/**
 * 미리보기 하단 액션 — PDF 저장 / 카톡 보내기 (2026-09-28 재작성).
 *
 * 이전 '카톡 보내기'는 navigator.share 에 텍스트만 넘겨 **PDF 가 고객에게 가지 않았고**,
 * 그런데도 '발송'으로 기록했다. 이제:
 *   1. 화면 진입 시 PDF 를 미리 받아 둔다 — iOS 는 탭 직후(사용자 제스처 안)에만 공유창을 열 수
 *      있어서, 탭한 뒤에 PDF 를 받기 시작하면 공유가 거부될 수 있다.
 *   2. 파일 공유가 되는 브라우저(Android Chrome·iOS Safari)는 PDF 파일 + 요약문을 공유창으로.
 *      실제로 파일을 공유했을 때만 발송 기록 (lib/sent-pdf-client.ts) — 발송 시각을 먼저 기록하고
 *      (PATCH pdfSentAt), 공유한 그 파일(같은 바이트)을 서버에 보관 (POST /sent-pdf → pdfUrl).
 *      무엇이 기록됐는지 그대로 안내한다.
 *   3. 파일 공유가 안 되는 곳(PC 등)은 PDF 저장 + 요약문 복사 후 안내.
 *   4. 카톡 인앱 브라우저는 파일 공유도 blob 저장도 안 되는 경우가 많다 — 외부 브라우저로 열기
 *      (kakaotalk://web/openExternal)를 권하고, 저장은 서버 URL(첨부 응답)로 직접 이동한다.
 *   저장은 브라우저가 끝났는지 알려주지 않으므로 "저장했어요"라고 단정하지 않는다.
 */
const isKakaoInApp = () => typeof navigator !== "undefined" && /KAKAOTALK/i.test(navigator.userAgent);

function openInExternalBrowser() {
  window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(window.location.href)}`;
}
export function PreviewActions({ estimateId, siteId, customerName, summaryText, detailLevel }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<"save" | "share" | "record" | null>(null);
  const [pdf, setPdf] = useState<PdfCache | null>(null);
  const fetching = useRef<{ level: "simple" | "detailed"; promise: Promise<File> } | null>(null);

  const filename = `견적서-${customerName}-${detailLevel === "detailed" ? "상세" : "간단"}.pdf`;
  const pdfUrl = `/api/estimates/${estimateId}/pdf?download=1&detail=${detailLevel}`;

  async function fetchPdf(): Promise<File> {
    const res = await fetch(pdfUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("PDF 생성에 실패했습니다");
    const blob = await res.blob();
    return new File([blob], filename, { type: "application/pdf" });
  }

  function getPdf(): Promise<File> {
    if (pdf && pdf.level === detailLevel) return Promise.resolve(pdf.file);
    // 받는 중인 PDF 가 지금 보는 간단/상세와 같을 때만 재사용 (보관 시 detail 표시가 틀리지 않게).
    if (!fetching.current || fetching.current.level !== detailLevel) {
      const level = detailLevel;
      const promise: Promise<File> = fetchPdf()
        .then((file) => { setPdf({ level, file }); return file; })
        .finally(() => { if (fetching.current?.promise === promise) fetching.current = null; });
      fetching.current = { level, promise };
    }
    return fetching.current.promise;
  }

  // 진입·간단/상세 전환 시 미리 받아 두기 (공유 버튼이 제스처 안에서 바로 열리게).
  useEffect(() => {
    let cancelled = false;
    const level = detailLevel;
    fetchPdf()
      .then((file) => { if (!cancelled) setPdf({ level, file }); })
      .catch(() => { /* 버튼을 누를 때 다시 시도 */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateId, detailLevel]);

  function downloadFile(file: File) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 바로 revoke 하면 일부 브라우저에서 다운로드가 취소된다.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  async function copySummary(silent = false) {
    try {
      await navigator.clipboard.writeText(summaryText);
      if (!silent) toast.success("요약문을 복사했어요");
      return true;
    } catch {
      if (!silent) toast.error("복사에 실패했습니다");
      return false;
    }
  }

  const externalAction = { label: "외부 브라우저로 열기", onClick: openInExternalBrowser };

  async function handleDownload() {
    if (isKakaoInApp()) {
      // 인앱 브라우저는 blob 다운로드를 무시하는 경우가 많아 서버의 첨부 응답으로 직접 이동.
      window.location.assign(new URL(pdfUrl, window.location.origin).href); // API 첨부 응답 — 페이지 이동 아님
      toast.info("저장이 시작되지 않으면 외부 브라우저(크롬·사파리)에서 열어 주세요.", { duration: 10000, action: externalAction });
      return;
    }
    setLoading("save");
    try {
      downloadFile(await getPdf());
      toast.success("PDF 저장을 시작했어요");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF 저장에 실패했습니다");
    } finally {
      setLoading(null);
    }
  }

  async function handleShare() {
    // 미리 받아둔 PDF 가 있으면 await 없이 바로 공유창 — iOS 제스처 유지.
    const ready = pdf && pdf.level === detailLevel ? pdf.file : null;
    const canShareFiles = (f: File) =>
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [f] });

    if (isKakaoInApp()) {
      // 카톡 안 브라우저는 파일 공유창을 못 연다 — 발송 기록 없이 외부 브라우저로 안내.
      const copied = await copySummary(true);
      toast.info(
        `카톡 안에서는 PDF 파일을 보낼 수 없어요. 외부 브라우저에서 열어 보내 주세요 (다시 로그인이 필요할 수 있어요).${copied ? " 요약문은 복사해 뒀어요." : ""}`,
        { duration: 12000, action: externalAction },
      );
      return;
    }

    setLoading("share");
    try {
      const level = detailLevel;
      const file = ready ?? (await getPdf());
      if (canShareFiles(file)) {
        await navigator.share({ files: [file], title: "견적서", text: summaryText });
        // 공유는 끝났다 — 이후 기록 실패는 안내만 (발송 자체는 성공).
        toast.success("견적서를 보냈어요");
        setLoading("record");
        const outcome = await recordSentPdf({ estimateId, file, level });
        const notice = sentRecordNotice(outcome);
        if (notice) {
          if (outcome === "none" || outcome === "unknown") toast.warning(notice, { duration: 8000 });
          else toast.info(notice, { duration: 6000 });
        }
        // 상세 화면(마지막 발송·보낸 견적서)이 캐시된 옛 화면을 보이지 않게 — 이미 돌아가 있어도 갱신된다.
        if (outcome !== "none") router.refresh();
        return;
      }
      // 파일 공유 불가 (카톡 인앱 브라우저·PC 등) — 저장 + 요약문 복사로 안내. 발송 기록은 안 함.
      downloadFile(file);
      const copied = await copySummary(true);
      toast.info(
        copied
          ? "이 브라우저는 파일 공유가 안 돼요. PDF 저장을 시작했고 요약문을 복사했어요 — 카톡에서 파일로 첨부해 주세요."
          : "이 브라우저는 파일 공유가 안 돼요. PDF 저장을 시작했어요 — 카톡에서 파일로 첨부해 주세요.",
        { duration: 8000 },
      );
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "AbortError") return; // 사용자가 공유창을 닫음
      if (name === "NotAllowedError") {
        if (!ready) {
          // PDF 를 받는 사이 제스처가 만료된 경우 — 이제 준비됐으니 한 번 더 누르면 바로 열린다.
          toast.info("PDF가 준비됐어요. 카톡 보내기를 한 번 더 눌러 주세요.");
          return;
        }
        // PDF 가 이미 준비돼 있었는데도 거부 — 이 브라우저가 파일 공유를 막는 것. 다시 눌러도 같으니
        // 저장 + 요약문 복사로 넘어간다.
        downloadFile(ready);
        const copied = await copySummary(true);
        toast.info(
          `이 브라우저가 파일 공유를 막았어요. PDF 저장을 시작했어요${copied ? "(요약문 복사됨)" : ""} — 카톡에서 파일로 첨부해 주세요.`,
          { duration: 8000 },
        );
        return;
      }
      toast.error(e instanceof Error && e.message ? e.message : "공유에 실패했습니다");
    } finally {
      setLoading(null);
    }
  }

  const base = `/sites/${siteId}/estimates/${estimateId}/preview`;

  return (
    <>
      {/* Detail level toggle — switches PDF source */}
      <div className="bg-card rounded-2xl border border-border/60 p-1 mb-3 grid grid-cols-2 gap-1">
        <Link
          href={`${base}?detail=simple`}
          replace
          className={`h-10 rounded-xl text-xs font-semibold flex items-center justify-center pressable ${
            detailLevel === "simple"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground"
          }`}
        >
          간단 내역
        </Link>
        <Link
          href={`${base}?detail=detailed`}
          replace
          className={`h-10 rounded-xl text-xs font-semibold flex items-center justify-center pressable ${
            detailLevel === "detailed"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground"
          }`}
        >
          상세 내역
        </Link>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 safe-x bg-gradient-to-t from-background via-background/95 to-transparent pt-6 pb-4">
        <div className="max-w-lg mx-auto px-4 safe-bottom">
          <button
            type="button"
            onClick={() => { void copySummary(); }}
            className="w-full mb-2 h-9 rounded-xl text-xs font-medium text-muted-foreground flex items-center justify-center gap-1.5 pressable"
          >
            <Copy size={13} />
            카톡 요약문만 복사
          </button>
          <div className="flex gap-2.5">
            <Button
              variant="outline"
              onClick={handleDownload}
              disabled={loading !== null}
              className="flex-1 h-14 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 pressable bg-card"
            >
              <FileText size={18} />
              {loading === "save" ? "저장 중..." : "PDF 저장"}
            </Button>
            <Button
              onClick={handleShare}
              disabled={loading !== null}
              className="flex-1 h-14 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 pressable"
            >
              <Share2 size={18} />
              {loading === "share" ? "준비 중..." : loading === "record" ? "기록 중..." : "카톡 보내기"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
