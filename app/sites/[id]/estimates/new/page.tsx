import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { NewEstimateForm } from "./NewEstimateForm";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

export default async function NewEstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const { edit } = await searchParams;

  const [site, settings, existing] = await Promise.all([
    prisma.site.findUnique({ where: { id } }),
    prisma.pricingSettings.findFirst(),
    edit ? prisma.estimate.findUnique({ where: { id: edit } }) : Promise.resolve(null),
  ]);
  if (!site) notFound();
  if (!settings) redirect("/settings");
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
        <NewEstimateForm siteId={id} settings={settings} existing={existing ?? undefined} />
      </div>
    </>
  );
}
