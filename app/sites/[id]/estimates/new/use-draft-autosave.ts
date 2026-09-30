import { useCallback, useEffect, useState } from "react";
import { DraftAutosaver, type DraftTarget } from "@/lib/estimate-draft";

export type { DraftTarget };

const DEBOUNCE_MS = 800;

/**
 * 견적 폼 초안 자동 저장 — 저장 규칙은 lib/estimate-draft.ts `DraftAutosaver`.
 * - 입력이 멈추고 ~0.8초 뒤 저장.
 * - 앱 전환(visibilitychange hidden)·탭 닫기(pagehide)·화면 이동(언마운트) 때 대기분 즉시 저장.
 * target 은 폼이 열려 있는 동안 고정 (초안 복원은 폼을 key 로 다시 연다).
 */
export function useDraftAutosave(target: DraftTarget | undefined, payload: object) {
  const serialized = JSON.stringify(payload);
  const [saver] = useState(() => (target ? new DraftAutosaver(serialized, target) : null));

  useEffect(() => {
    if (!saver || !saver.update(serialized)) return;
    const t = setTimeout(() => saver.persist(), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [saver, serialized]);

  // 초안에서 복원한 폼 — 복원한 내용을 바로 다시 저장.
  useEffect(() => {
    saver?.saveRestored();
  }, [saver]);

  useEffect(() => {
    if (!saver) return;
    const persist = () => saver.persist();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persist();
    };
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", onVisibility);
      persist(); // 앱 안 이동 (뒤로 가기 등) — 디바운스 대기분까지 저장
    };
  }, [saver]);

  /** 제출 성공 — 초안을 지우고 이후 저장을 멈춘다. 화면 이동 전에 부를 것. */
  const markSubmitted = useCallback(() => saver?.markSubmitted(), [saver]);

  return { markSubmitted };
}
