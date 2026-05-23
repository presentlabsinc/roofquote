import { prisma } from "@/lib/prisma";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await prisma.pricingSettings.findFirst();
  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">단가 설정</h1>
      <p className="text-sm text-gray-500 mb-6">기본 단가를 설정합니다. 새로 만드는 견적에만 적용됩니다.</p>
      <SettingsForm defaultValues={settings} />
    </div>
  );
}
