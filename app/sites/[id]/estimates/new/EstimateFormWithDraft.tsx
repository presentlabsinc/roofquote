"use client";
/**
 * 견적 폼 + 초안 복원 배너 (lib/estimate-draft.ts).
 *
 * 폼을 열 때 이 현장·견적의 초안이 있으면 "작성 중이던 견적이 있어요" 배너로 이어서 쓸지 묻는다.
 * [이어서 작성] = 폼을 초안 값으로 다시 연다 (key 로 remount + initial). [버리기] = 초안 삭제.
 * 답하지 않고 폼에 새로 입력하면, 자동 저장이 같은 키를 덮어쓰기 직전에 배너를 닫고 '되돌리기'를 띄운다
 * (묻는 중인 초안이 말없이 사라지지 않게 — DraftTarget.offerRef).
 * 초안은 하이드레이션이 끝난 뒤에만 읽는다 (서버 HTML 에는 localStorage 가 없어서).
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { History } from "lucide-react";
import type { Estimate, PricingSettings } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  clearDraftIfUnchanged, draftKey, formatDraftAge, pruneDrafts, readDraft, resolveDraftOffer, saveDraft,
  type EstimateDraft, type EstimateFormInitial,
} from "@/lib/estimate-draft";
import { NewEstimateForm } from "./NewEstimateForm";

interface Props {
  siteId: string;
  userId: string;
  settings: PricingSettings;
  existing?: Estimate;
}

const noopSubscribe = () => () => {};

export function EstimateFormWithDraft({ siteId, userId, settings, existing }: Props) {
  const key = draftKey(userId, siteId, existing?.id);
  const baseUpdatedAt = existing ? new Date(existing.updatedAt).toISOString() : null;
  // 서버·하이드레이션 렌더 = false, 그 다음 렌더부터 true.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [restored, setRestored] = useState<{ initial: EstimateFormInitial; n: number } | null>(null);
  const [bannerClosed, setBannerClosed] = useState(false);
  // 배너가 묻고 있는 초안의 처리 함수 — 폼 자동 저장이 이 키를 처음 덮어쓰기 직전에 부른다.
  const offerRef = useRef<(() => void) | null>(null);

  const restore = useCallback((initial: EstimateFormInitial) => {
    setBannerClosed(true);
    setRestored((r) => ({ initial, n: (r?.n ?? 0) + 1 }));
  }, []);
  const closeBanner = useCallback(() => setBannerClosed(true), []);

  return (
    <>
      {hydrated && !bannerClosed && (
        <DraftBanner
          draftKey={key}
          baseUpdatedAt={baseUpdatedAt}
          isEditing={!!existing}
          offerRef={offerRef}
          onRestore={restore}
          onClose={closeBanner}
        />
      )}
      <NewEstimateForm
        key={restored?.n ?? 0}
        siteId={siteId}
        settings={settings}
        existing={existing}
        initial={restored?.initial}
        draft={{ key, baseUpdatedAt, fromDraft: !!restored, offerRef }}
      />
    </>
  );
}

/**
 * 지운 초안 '되돌리기' 토스트 (10초 — 설정 화면 되돌리기와 같음). 되돌리면 초안을 저장소에 먼저 다시 쓴다:
 * 토스트는 화면을 옮겨도 남으므로, 폼을 떠난 뒤에 눌러도 다음에 열 때 다시 제안된다.
 */
function toastUndo(message: string, key: string, draft: EstimateDraft, initial: EstimateFormInitial,
  onRestore: (initial: EstimateFormInitial) => void) {
  toast(message, {
    id: "estimate-draft-discarded",
    duration: 10_000,
    action: {
      label: "되돌리기",
      onClick: () => {
        saveDraft(key, { payload: draft.payload, baseUpdatedAt: draft.baseUpdatedAt });
        onRestore(initial);
      },
    },
  });
}

function DraftBanner({ draftKey: key, baseUpdatedAt, isEditing, offerRef, onRestore, onClose }: {
  draftKey: string;
  baseUpdatedAt: string | null;
  isEditing: boolean;
  offerRef: { current: (() => void) | null };
  onRestore: (initial: EstimateFormInitial) => void;
  onClose: () => void;
}) {
  // 처음 한 번만 읽는다 — 이후 자동 저장이 같은 키에 써도 배너 내용은 그대로.
  const [found] = useState(() => {
    const offer = resolveDraftOffer(readDraft(key), baseUpdatedAt);
    return { offer, age: offer.status === "offer" ? formatDraftAge(offer.draft.savedAt) : "" };
  });
  const { offer } = found;

  useEffect(() => {
    pruneDrafts(); // 다른 현장에 남은 오래된 초안 정리
    if (offer.status !== "discard") return;
    clearDraftIfUnchanged(key, offer.savedAt); // 그 사이 폼이 새로 저장했으면 그건 남긴다
    if (offer.baseChanged) toast("저장된 견적이 바뀌어 이전 초안은 지웠어요", { id: "estimate-draft-stale" });
  }, [offer, key]);

  // 묻는 동안 폼에 새로 입력해 자동 저장이 이 키를 덮어쓰게 되면 = 새로 쓰기로 한 것.
  useEffect(() => {
    if (offer.status !== "offer") return;
    const { draft, initial } = offer;
    const onReplaced = () => {
      offerRef.current = null;
      onClose();
      toastUndo("새 입력을 저장해서 이전 초안은 지웠어요", key, draft, initial, onRestore);
    };
    offerRef.current = onReplaced;
    return () => {
      // 해제를 한 박자 미룬다 — 화면을 떠날 때 React 는 이 배너의 정리를 폼의 정리(마지막 저장)보다 먼저 돌려서,
      // 바로 해제하면 폼이 묻지도 않고 제안 중인 초안을 덮어썼다. 미뤄 두면 마지막 저장도 '되돌리기' 토스트를 띄운다
      // (언마운트된 배너의 onClose 는 무해). 같은 커밋에서 새 핸들러가 등록됐으면 그건 건드리지 않는다.
      queueMicrotask(() => {
        if (offerRef.current === onReplaced) offerRef.current = null;
      });
    };
  }, [offer, key, offerRef, onClose, onRestore]);

  if (offer.status !== "offer") return null;
  const { draft, initial } = offer;

  function restore() {
    offerRef.current = null;
    onRestore(initial);
  }

  function discard() {
    offerRef.current = null;
    clearDraftIfUnchanged(key, draft.savedAt); // 이 초안만 — 그 사이 저장된 지금 입력은 남긴다
    onClose();
    toastUndo("초안을 지웠어요", key, draft, initial, onRestore);
  }

  return (
    <div role="status" className="mb-3 rounded-2xl border border-primary/30 bg-primary/5 p-3.5">
      <div className="flex items-center gap-2">
        <History size={18} className="text-primary shrink-0" />
        <p className="flex-1 text-sm font-semibold text-foreground">
          {isEditing ? "수정 중이던 내용이 있어요" : "작성 중이던 견적이 있어요"}
          <span className="ml-1 font-normal text-muted-foreground tabular-nums">({found.age})</span>
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          onClick={restore}
          className="h-11 rounded-xl text-sm font-semibold pressable"
        >
          이어서 작성
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={discard}
          className="h-11 rounded-xl text-sm font-semibold pressable"
        >
          버리기
        </Button>
      </div>
    </div>
  );
}
