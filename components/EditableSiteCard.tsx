"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, Pencil, X } from "lucide-react";

interface Props {
  siteId: string;
  customerName: string;
  customerPhone: string | null;
  siteAddress: string;
  generalMemo: string | null;
}

/**
 * 현장 상세 상단의 고객/현장 정보 카드 — 보기 ↔ 편집 토글.
 * 편집 저장은 PATCH /api/sites/[id] (이름/전화/주소/메모 화이트리스트).
 */
export function EditableSiteCard({ siteId, customerName, customerPhone, siteAddress, generalMemo }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(customerName);
  const [phone, setPhone] = useState(customerPhone ?? "");
  const [address, setAddress] = useState(siteAddress);
  const [memo, setMemo] = useState(generalMemo ?? "");

  function startEdit() {
    // 최신 props 로 입력값 초기화 (refresh 후 props 갱신 대비)
    setName(customerName);
    setPhone(customerPhone ?? "");
    setAddress(siteAddress);
    setMemo(generalMemo ?? "");
    setEditing(true);
  }

  async function handleSave() {
    if (!name.trim()) { toast.error("고객명을 입력해 주세요"); return; }
    if (!address.trim()) { toast.error("현장 주소를 입력해 주세요"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name,
          customerPhone: phone || null,
          siteAddress: address,
          generalMemo: memo || null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("수정되었습니다");
      setEditing(false);
      router.refresh();
    } catch {
      toast.error("수정에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="bg-card rounded-2xl border border-border/60 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground text-sm">현장 정보 수정</h2>
          <button
            onClick={() => setEditing(false)}
            className="text-muted-foreground hover:text-foreground pressable"
            aria-label="취소"
          >
            <X size={18} />
          </button>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block font-medium">고객명</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" className="h-12 text-base rounded-xl" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block font-medium">연락처</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" inputMode="tel" type="tel" className="h-12 text-base rounded-xl tabular-nums" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block font-medium">현장 주소</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="예: 경기도 수원시..." className="h-12 text-base rounded-xl" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block font-medium">현장 메모</Label>
          <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="현장 특이사항, 고객 요청 등" rows={3} className="text-base rounded-xl resize-none" />
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={() => setEditing(false)} disabled={saving} className="flex-1 h-12 rounded-xl">취소</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 h-12 rounded-xl font-semibold">
            {saving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border/60 p-5 relative">
      <button
        onClick={startEdit}
        className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-muted/60 text-muted-foreground hover:text-foreground pressable"
        aria-label="현장 정보 수정"
      >
        <Pencil size={15} />
      </button>
      <p className="text-xl font-bold text-foreground pr-10">{customerName}</p>
      <div className="space-y-2 mt-3">
        <div className="flex items-start gap-2 text-sm">
          <MapPin size={15} className="text-muted-foreground mt-0.5 shrink-0" />
          <span className="text-foreground">{siteAddress}</span>
        </div>
        {customerPhone && (
          <a href={`tel:${customerPhone}`} className="flex items-center gap-2 text-sm pressable rounded-lg -mx-1 px-1 py-0.5">
            <Phone size={15} className="text-primary" />
            <span className="text-primary font-semibold tabular-nums">{customerPhone}</span>
          </a>
        )}
      </div>
      {generalMemo && (
        <div className="mt-4 p-3 bg-muted/60 rounded-xl text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {generalMemo}
        </div>
      )}
    </div>
  );
}
