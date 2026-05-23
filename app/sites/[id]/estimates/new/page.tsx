import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { NewEstimateForm } from "./NewEstimateForm";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

export default async function NewEstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [site, settings] = await Promise.all([
    prisma.site.findUnique({ where: { id } }),
    prisma.pricingSettings.findFirst(),
  ]);
  if (!site) notFound();
  if (!settings) redirect("/settings");

  return (
    <>
      <AppHeader title="견적 만들기" subtitle={site.customerName} />
      <div className="max-w-lg mx-auto px-4 pt-4">
        <NewEstimateForm siteId={id} settings={settings} />
      </div>
    </>
  );
}
