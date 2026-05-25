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

  return (
    <>
      <AppHeader title="견적서" subtitle={e.site.customerName} />
      <div className="max-w-lg mx-auto px-4 pt-4">
        <EstimateDetail estimate={e as Parameters<typeof EstimateDetail>[0]["estimate"]} />
      </div>
    </>
  );
}
