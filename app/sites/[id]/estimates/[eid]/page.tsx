import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EstimateDetail } from "./EstimateDetail";

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
    <div className="max-w-lg mx-auto px-4 pt-6 pb-8">
      <div className="mb-5">
        <Link href={`/sites/${id}`} className="text-sm text-blue-600">← {estimate.site.customerName}</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">견적 내역</h1>
        <p className="text-sm text-gray-500">{estimate.site.siteAddress}</p>
      </div>
      <EstimateDetail estimate={estimate as Parameters<typeof EstimateDetail>[0]["estimate"]} />
    </div>
  );
}
