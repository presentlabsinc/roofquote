"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Camera, X, Plus } from "lucide-react";
import type { PhotoItem } from "@/lib/types";

export function NewSiteForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [generalMemo, setGeneralMemo] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPhotos((prev) => [...prev, { url: ev.target?.result as string, memo: "" }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }

  function updateMemo(idx: number, memo: string) {
    setPhotos((prev) => prev.map((p, i) => (i === idx ? { ...p, memo } : p)));
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    if (!customerName.trim()) { toast.error("고객명을 입력해 주세요."); return; }
    if (!siteAddress.trim()) { toast.error("현장 주소를 입력해 주세요."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName, customerPhone: customerPhone || null, siteAddress, photos, generalMemo: generalMemo || null }),
      });
      if (!res.ok) throw new Error();
      const site = await res.json();
      toast.success("현장이 등록되었습니다.");
      router.push(`/sites/${site.id}`);
    } catch {
      toast.error("등록에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-gray-800">고객 정보</h2>
        <div className="space-y-3">
          <div>
            <Label className="text-sm text-gray-600 mb-1 block">고객명 *</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="예: 홍길동" inputMode="text" />
          </div>
          <div>
            <Label className="text-sm text-gray-600 mb-1 block">연락처</Label>
            <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="010-0000-0000" inputMode="tel" type="tel" />
          </div>
          <div>
            <Label className="text-sm text-gray-600 mb-1 block">현장 주소 *</Label>
            <Input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} placeholder="예: 경기도 수원시 영통구..." inputMode="text" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-gray-800">현장 사진</h2>
        <label className="flex items-center justify-center gap-2 h-14 border-2 border-dashed border-blue-200 rounded-xl text-blue-500 text-sm font-medium cursor-pointer hover:bg-blue-50 transition-colors">
          <Camera size={20} />
          <span>사진 추가</span>
          <input type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={handlePhotoChange} />
        </label>
        {photos.length > 0 && (
          <div className="space-y-3">
            {photos.map((photo, idx) => (
              <div key={idx} className="flex gap-3 items-start">
                <div className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt="" className="w-16 h-16 object-cover rounded-xl" />
                  <button onClick={() => removePhoto(idx)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center">
                    <X size={12} />
                  </button>
                </div>
                <Input
                  value={photo.memo ?? ""}
                  onChange={(e) => updateMemo(idx, e.target.value)}
                  placeholder="사진 메모 (선택)"
                  className="flex-1"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 mb-3">현장 메모</h2>
        <Textarea
          value={generalMemo}
          onChange={(e) => setGeneralMemo(e.target.value)}
          placeholder="현장 특이사항, 고객 요청사항 등을 자유롭게 적어 주세요."
          rows={4}
        />
      </div>

      <Button onClick={handleSubmit} disabled={saving} className="w-full h-14 text-base font-semibold rounded-2xl">
        {saving ? "등록 중..." : "현장 등록하기"}
      </Button>
    </div>
  );
}
