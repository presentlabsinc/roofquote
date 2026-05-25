import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { EstimateDetail } from "./EstimateDetail";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string; eid: string }>;
}) {
  const user = await requireUser();
  const { id, eid } = await params;
  // Ownership enforced via site.userId join filter — findFirst returns null for
  // estimates owned by other users (no 404/403 distinction).
  const e = await prisma.estimate.findFirst({
    where: { id: eid, site: { userId: user.id } },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
  });
  if (!e || e.siteId !== id) notFound();

  // Margin distribution ratios — same source the PDF route uses. Passed to
  // EstimateDetail so the in-app line items can show '(고객가 X원)' next to
  // each cost using the SAME numbers the customer will see on the PDF.
  const settings = await prisma.pricingSettings.findUnique({ where: { userId: user.id } });
  const marginRatios = {
    material: settings?.marginMaterialRatio ?? 0.5,
    labor: settings?.marginLaborRatio ?? 0.25,
    profit: settings?.marginProfitRatio ?? 0.25,
  };

  return (
    <>
      <AppHeader title="견적서" subtitle={e.site.customerName} />
      <div className="max-w-lg mx-auto px-4 pt-4">
        <EstimateDetail
          estimate={e as Parameters<typeof EstimateDetail>[0]["estimate"]}
          marginRatios={marginRatios}
        />
      </div>
    </>
  );
}
