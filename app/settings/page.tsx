import { prisma } from "@/lib/prisma";
import { SettingsForm } from "./SettingsForm";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await prisma.pricingSettings.findFirst();
  return (
    <>
      <AppHeader title="설정" subtitle="회사 정보 · 단가 · 견적서" showBack={false} />
      <div className="max-w-lg mx-auto px-4 pt-4">
        <SettingsForm defaultValues={settings} />
      </div>
    </>
  );
}
