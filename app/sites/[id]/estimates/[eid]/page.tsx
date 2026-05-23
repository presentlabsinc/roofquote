import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EstimateDetail } from "./EstimateDetail";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string; eid: string }>;
}) {
  const { id, eid } = await params;
  const estimate = await prisma.estimate.findUnique({
    where: { id: eid },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
  });
  if (!estimate || estimate.siteId !== id) notFound();

  return (
    <>
      <AppHeader title="견적서" subtitle={estimate.site.customerName} />
      <div className="max-w-lg mx-auto px-4 pt-4">
        <EstimateDetail estimate={estimate as Parameters<typeof EstimateDetail>[0]["estimate"]} />
      </div>
    </>
  );
}
