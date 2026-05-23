import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { NewEstimateForm } from "./NewEstimateForm";

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
    <div className="max-w-lg mx-auto px-4 pt-6 pb-8">
      <div className="mb-6">
        <p className="text-sm text-blue-600 mb-1">← {site.customerName}</p>
        <h1 className="text-2xl font-bold text-gray-900">견적 만들기</h1>
        <p className="text-sm text-gray-500 mt-1">{site.siteAddress}</p>
      </div>
      <NewEstimateForm siteId={id} settings={settings} />
    </div>
  );
}
