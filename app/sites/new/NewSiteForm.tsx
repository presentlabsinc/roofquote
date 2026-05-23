"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Camera, X, User, MapPin } from "lucide-react";
import type { PhotoItem } from "@/lib/types";

export function NewSiteForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [generalMemo, setGeneralMemo] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [uploading, setUploading] = useState(0);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading((n) => n + files.length);
    await Promise.all(files.map(async (file) => {
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) throw new Error();
        const { url } = await res.json();
        setPhotos((prev) => [...prev, { url, memo: "" }]);
      } catch {
        toast.error(`${file.name} 업로드 실패`);
      } finally {
        setUploading((n) => n - 1);
      }
    }));
  }

  function updateMemo(idx: number, memo: string) {
    setPhotos((prev) => prev.map((p, i) => (i === idx ? { ...p, memo } : p)));
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    if (!customerName.trim()) { toast.error("고객명을 입력해 주세요"); return; }
    if (!siteAddress.trim()) { toast.error("현장 주소를 입력해 주세요"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName, customerPhone: customerPhone || null, siteAddress, photos, generalMemo: generalMemo || null }),
      });
      if (!res.ok) throw new Error();
      const site = await res.json();
      toast.success("등록되었습니다");
      router.push(`/sites/${site.id}`);
    } catch {
      toast.error("등록에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="space-y-3 pb-28">
        {/* Customer */}
        <Section icon={<User size={18} />} title="고객 정보">
          <Field label="고객명" required>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="홍길동" className="h-12 text-base rounded-xl" />
          </Field>
          <Field label="연락처">
            <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="010-0000-0000" inputMode="tel" type="tel" className="h-12 text-base rounded-xl tabular-nums" />
          </Field>
        </Section>

        {/* Site */}
        <Section icon={<MapPin size={18} />} title="현장 주소">
          <Field label="주소" required>
            <Input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} placeholder="예: 경기도 수원시 영통구..." className="h-12 text-base rounded-xl" />
          </Field>
        </Section>

        {/* Photos */}
        <Section icon={<Camera size={18} />} title={`현장 사진${photos.length > 0 ? ` (${photos.length})` : ""}`}>
          <label className="flex items-center justify-center gap-2 h-16 border-2 border-dashed border-primary/30 bg-primary/5 rounded-2xl text-primary text-sm font-semibold cursor-pointer pressable">
            <Camera size={20} />
            <span>{uploading > 0 ? `업로드 중... (${uploading})` : "사진 추가 / 촬영"}</span>
            <input type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={handlePhotoChange} disabled={uploading > 0} />
          </label>
          {photos.length > 0 && (
            <div className="space-y-2.5 mt-3">
              {photos.map((photo, idx) => (
                <div key={idx} className="flex gap-3 items-start bg-muted/40 p-2 rounded-2xl">
                  <div className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt="" className="w-16 h-16 object-cover rounded-xl" />
                    <button onClick={() => removePhoto(idx)} className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-black/80 text-white rounded-full flex items-center justify-center pressable">
                      <X size={13} strokeWidth={3} />
                    </button>
                  </div>
                  <Input
                    value={photo.memo ?? ""}
                    onChange={(e) => updateMemo(idx, e.target.value)}
                    placeholder="메모 (예: 우측 처마 누수)"
                    className="flex-1 h-11 text-sm rounded-xl bg-card"
                  />
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Memo */}
        <Section title="현장 메모">
          <Textarea
            value={generalMemo}
            onChange={(e) => setGeneralMemo(e.target.value)}
            placeholder="현장 특이사항, 고객 요청 등을 자유롭게 적어 주세요"
            rows={4}
            className="text-base rounded-xl resize-none"
          />
        </Section>
      </div>

      {/* Sticky submit */}
      <StickySubmit
        onClick={handleSubmit}
        disabled={saving || uploading > 0}
        label={uploading > 0 ? "사진 업로드 중..." : saving ? "등록 중..." : "현장 등록하기"}
      />
    </>
  );
}

function Section({ icon, title, children }: { icon?: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border/60 p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-primary">{icon}</span>}
        <h2 className="font-semibold text-foreground text-sm">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground mb-1.5 block font-medium">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

export function StickySubmit({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 safe-x bg-gradient-to-t from-background via-background to-transparent pt-6 pb-4">
      <div className="max-w-lg mx-auto px-4 safe-bottom">
        <Button
          onClick={onClick}
          disabled={disabled}
          className="w-full h-14 text-base font-semibold rounded-2xl shadow-lg shadow-primary/25 pressable"
        >
          {label}
        </Button>
      </div>
    </div>
  );
}
