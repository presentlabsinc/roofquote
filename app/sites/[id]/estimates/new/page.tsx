import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserAndSettings } from "@/lib/auth";
import { EstimateFormWithDraft } from "./EstimateFormWithDraft";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

export default async function NewEstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { user, settings } = await requireUserAndSettings();
  const { id } = await params;
  const { edit } = await searchParams;

  // Both queries scoped to the user via site.userId. Estimate ownership
  // flows through the site relation (no userId column on Estimate directly).
  const [site, existing] = await Promise.all([
    prisma.site.findFirst({ where: { id, userId: user.id } }),
    edit
      ? prisma.estimate.findFirst({ where: { id: edit, site: { userId: user.id } } })
      : Promise.resolve(null),
  ]);
  if (!site) notFound();
  // If edit ID is provided but estimate doesn't exist (or wrong site), drop the param
  if (edit && (!existing || existing.siteId !== id)) {
    redirect(`/sites/${id}/estimates/new`);
  }

  const isEditing = !!existing;

  return (
    <>
      <AppHeader
        title={isEditing ? "견적 수정" : "견적 만들기"}
        subtitle={site.customerName}
      />
      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* 초안 자동 저장·복원 — 키는 사용자·현장·견적별 (lib/estimate-draft.ts) */}
        <EstimateFormWithDraft siteId={id} userId={user.id} settings={settings} existing={existing ?? undefined} />
      </div>
    </>
  );
}
