import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcTotals, calcFromFinalPrice } from "@/lib/calculations";

export async function GET(_: Request, { params }: { params: Promise<{ eid: string }> }) {
  const { eid } = await params;
  const estimate = await prisma.estimate.findUnique({
    where: { id: eid },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
  });
  if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(estimate);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ eid: string }> }) {
  const { eid } = await params;
  const body = await req.json();

  const estimate = await prisma.estimate.findUnique({
    where: { id: eid },
    include: { lineItems: true },
  });
  if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Update a line item's total
  if (body.lineItemId && body.total !== undefined) {
    await prisma.estimateLineItem.update({
      where: { id: body.lineItemId },
      data: { total: body.total, isUserEdited: true },
    });
    // Recalculate totals from current line items
    const updatedItems = await prisma.estimateLineItem.findMany({ where: { estimateId: eid } });
    const totals = calcTotals(updatedItems, estimate.marginRate, estimate.vatIncluded);
    const updated = await prisma.estimate.update({
      where: { id: eid },
      data: { ...totals, marginMode: estimate.marginMode, updatedAt: new Date() },
      include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
    });
    return NextResponse.json(updated);
  }

  // Update margin rate
  if (body.marginRate !== undefined) {
    const items = await prisma.estimateLineItem.findMany({ where: { estimateId: eid } });
    const totals = calcTotals(items, body.marginRate, estimate.vatIncluded);
    const updated = await prisma.estimate.update({
      where: { id: eid },
      data: { ...totals, marginRate: body.marginRate, marginMode: "percent", updatedAt: new Date() },
      include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
    });
    return NextResponse.json(updated);
  }

  // Update margin amount directly
  if (body.marginAmount !== undefined) {
    const supplyPrice = estimate.totalCost + body.marginAmount;
    const vat = Math.round(supplyPrice * 0.1);
    const finalPrice = estimate.vatIncluded ? supplyPrice + vat : supplyPrice;
    const marginRate = estimate.totalCost > 0 ? body.marginAmount / estimate.totalCost : 0;
    const updated = await prisma.estimate.update({
      where: { id: eid },
      data: { marginAmount: body.marginAmount, marginRate, supplyPrice, vat, finalPrice, marginMode: "amount", updatedAt: new Date() },
      include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
    });
    return NextResponse.json(updated);
  }

  // Update final price (back-calculate)
  if (body.finalPrice !== undefined) {
    const derived = calcFromFinalPrice(estimate.totalCost, body.finalPrice, estimate.vatIncluded);
    const updated = await prisma.estimate.update({
      where: { id: eid },
      data: { finalPrice: body.finalPrice, ...derived, marginMode: "finalPrice", updatedAt: new Date() },
      include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
    });
    return NextResponse.json(updated);
  }

  // Update VAT toggle
  if (body.vatIncluded !== undefined) {
    const items = await prisma.estimateLineItem.findMany({ where: { estimateId: eid } });
    const totals = calcTotals(items, estimate.marginRate, body.vatIncluded);
    const updated = await prisma.estimate.update({
      where: { id: eid },
      data: { ...totals, vatIncluded: body.vatIncluded, marginMode: estimate.marginMode, updatedAt: new Date() },
      include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
    });
    return NextResponse.json(updated);
  }

  // Generic field update (paymentTerms, validityDays, pdfUrl, pdfSentAt)
  const allowedFields = ["paymentTerms", "validityDays", "pdfUrl", "pdfSentAt"];
  const updateData: Record<string, unknown> = {};
  for (const f of allowedFields) {
    if (body[f] !== undefined) updateData[f] = body[f];
  }
  if (Object.keys(updateData).length > 0) {
    const updated = await prisma.estimate.update({
      where: { id: eid },
      data: { ...updateData, updatedAt: new Date() },
      include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}
