import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserAndSettings } from "@/lib/auth";
import { AppHeader } from "@/components/AppHeader";
import { QuickEstimateForm } from "./QuickEstimateForm";

export const dynamic = "force-dynamic";

/** 번개 견적 — 유형·면적·평당가만으로 일반 견적을 만든다 (lib/quick-estimate.ts). */
export default async function QuickEstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { user, settings } = await requireUserAndSettings();
  const { id } = await params;
  const site = await prisma.site.findFirst({ where: { id, userId: user.id } });
  if (!site) notFound();

  return (
    <>
      <AppHeader title="번개 견적" subtitle={site.customerName} />
      <div className="max-w-lg mx-auto px-4 pt-4">
        <QuickEstimateForm siteId={id} userId={user.id} settings={settings} />
      </div>
    </>
  );
}
