"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { PricingSettings } from "@/app/generated/prisma/client";
import type { ScopeFlags } from "@/lib/types";
import { pyeongToSqm, sqmToPyeong } from "@/lib/calculations";

interface Props {
  siteId: string;
  settings: PricingSettings;
}

const DEFAULT_SCOPE: ScopeFlags = {
  colorSteel: true,
  overlay: false,
  removal: false,
  ridge: true,
  eave: true,
  gutter: false,
  waste: false,
  skylift: false,
  ladderTruck: false,
};

export function NewEstimateForm({ siteId, settings }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Area — two synced fields. Track which was last edited so rounding
  // doesn't jitter the field the user is currently typing in.
  const [sqmInput, setSqmInput] = useState("");
  const [pyeongInput, setPyeongInput] = useState("");

  // Scope
  const [scope, setScope] = useState<ScopeFlags>(DEFAULT_SCOPE);

  // Work details
  const [workerCount, setWorkerCount] = useState(String(settings.defaultWorkerCount));
  const [workDays, setWorkDays] = useState("2");
  const [gutterLength, setGutterLength] = useState("");
  const [skyliftDays, setSkyliftDays] = useState("1");
  const [ladderTruckDays, setLadderTruckDays] = useState("1");

  function toggleScope(key: keyof ScopeFlags) {
    setScope((s) => ({ ...s, [key]: !s[key] }));
  }

  function getAreaM2(): number {
    return parseFloat(sqmInput) || 0;
  }

  function handleSqmChange(val: string) {
    setSqmInput(val);
    const n = parseFloat(val);
    setPyeongInput(Number.isFinite(n) && n > 0 ? String(sqmToPyeong(n)) : "");
  }

  function handlePyeongChange(val: string) {
    setPyeongInput(val);
    const n = parseFloat(val);
    setSqmInput(Number.isFinite(n) && n > 0 ? String(pyeongToSqm(n)) : "");
  }

  async function handleCreate() {
    const areaM2 = getAreaM2();
    if (areaM2 <= 0) { toast.error("면적을 입력해 주세요."); return; }
    if (scope.gutter && !gutterLength) { toast.error("물받이 길이를 입력해 주세요."); return; }

    setSaving(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/estimates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          areaM2,
          workerCount: parseInt(workerCount) || settings.defaultWorkerCount,
          workDays: parseFloat(workDays) || 2,
          gutterLengthM: scope.gutter ? parseFloat(gutterLength) || 0 : 0,
          skyliftDays: scope.skylift ? parseFloat(skyliftDays) || 1 : 0,
          ladderTruckDays: scope.ladderTruck ? parseFloat(ladderTruckDays) || 1 : 0,
          scopeFlags: scope,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "실패");
      }
      const est = await res.json();
      toast.success("견적이 생성되었습니다.");
      router.push(`/sites/${siteId}/estimates/${est.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "견적 생성에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Area — two synced fields, type in either */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 mb-1">면적 입력</h2>
        <p className="text-xs text-gray-400 mb-4">㎡ 또는 평 어디든 입력하면 자동 변환됩니다 (1평 = 3.3058㎡)</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">제곱미터</Label>
            <div className="relative">
              <Input
                type="number"
                inputMode="decimal"
                value={sqmInput}
                onChange={(e) => handleSqmChange(e.target.value)}
                placeholder="0"
                className="text-xl font-bold h-14 pr-10 text-center"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">㎡</span>
            </div>
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">평</Label>
            <div className="relative">
              <Input
                type="number"
                inputMode="decimal"
                value={pyeongInput}
                onChange={(e) => handlePyeongChange(e.target.value)}
                placeholder="0"
                className="text-xl font-bold h-14 pr-10 text-center"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">평</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scope */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 mb-4">공사 범위</h2>
        <div className="space-y-4">
          {(
            [
              { key: "colorSteel", label: "칼라강판 시공" },
              { key: "overlay", label: "기존 지붕 덧씌우기" },
              { key: "removal", label: "기존 지붕 철거" },
              { key: "ridge", label: "용마루 마감" },
              { key: "eave", label: "처마 마감" },
              { key: "waste", label: "폐기물 처리" },
            ] as { key: keyof ScopeFlags; label: string }[]
          ).map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3">
              <Checkbox
                id={key}
                checked={scope[key]}
                onCheckedChange={() => toggleScope(key)}
                className="w-5 h-5"
              />
              <Label htmlFor={key} className="text-base text-gray-700">{label}</Label>
            </div>
          ))}

          {/* Gutter with length */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Checkbox
                id="gutter"
                checked={scope.gutter}
                onCheckedChange={() => toggleScope("gutter")}
                className="w-5 h-5"
              />
              <Label htmlFor="gutter" className="text-base text-gray-700">물받이 교체</Label>
            </div>
            {scope.gutter && (
              <div className="ml-8 flex items-center gap-2">
                <Input type="number" inputMode="numeric" value={gutterLength} onChange={(e) => setGutterLength(e.target.value)} placeholder="0" className="w-28" />
                <span className="text-sm text-gray-500">m</span>
              </div>
            )}
          </div>

          {/* Skylift with days */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Checkbox
                id="skylift"
                checked={scope.skylift}
                onCheckedChange={() => toggleScope("skylift")}
                className="w-5 h-5"
              />
              <Label htmlFor="skylift" className="text-base text-gray-700">스카이차 사용</Label>
            </div>
            {scope.skylift && (
              <div className="ml-8 flex items-center gap-2">
                <Input type="number" inputMode="numeric" value={skyliftDays} onChange={(e) => setSkyliftDays(e.target.value)} placeholder="1" className="w-28" />
                <span className="text-sm text-gray-500">일</span>
              </div>
            )}
          </div>

          {/* Ladder truck with days */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Checkbox
                id="ladderTruck"
                checked={scope.ladderTruck}
                onCheckedChange={() => toggleScope("ladderTruck")}
                className="w-5 h-5"
              />
              <Label htmlFor="ladderTruck" className="text-base text-gray-700">사다리차 사용</Label>
            </div>
            {scope.ladderTruck && (
              <div className="ml-8 flex items-center gap-2">
                <Input type="number" inputMode="numeric" value={ladderTruckDays} onChange={(e) => setLadderTruckDays(e.target.value)} placeholder="1" className="w-28" />
                <span className="text-sm text-gray-500">일</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Work details */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 mb-4">작업 정보</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-sm text-gray-600 mb-1 block">작업 일수</Label>
            <div className="relative">
              <Input type="number" inputMode="numeric" value={workDays} onChange={(e) => setWorkDays(e.target.value)} className="pr-6" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">일</span>
            </div>
          </div>
          <div>
            <Label className="text-sm text-gray-600 mb-1 block">작업 인원</Label>
            <div className="relative">
              <Input type="number" inputMode="numeric" value={workerCount} onChange={(e) => setWorkerCount(e.target.value)} className="pr-6" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">명</span>
            </div>
          </div>
        </div>
      </div>

      <Button onClick={handleCreate} disabled={saving} className="w-full h-14 text-base font-semibold rounded-2xl">
        {saving ? "계산 중..." : "견적 계산하기"}
      </Button>
    </div>
  );
}
