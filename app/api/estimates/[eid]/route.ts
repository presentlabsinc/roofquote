import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcTotals, calcFromFinalPrice } from "@/lib/calculations";
import type { Estimate } from "@prisma/client";

/**
 * Recompute totals from current line items and return the full estimate.
 * Used after any line-item-level mutation (edit / undo / delete / add).
 */
async function recalcAndReturn(eid: string, estimate: Estimate) {
  const items = await prisma.estimateLineItem.findMany({ where: { estimateId: eid } });
  let totals;
  if (estimate.marginMode === "finalPrice") {
    // Keep the user's finalPrice fixed; re-derive marginRate/Amount from new totalCost
    const totalCost = items.reduce((s, i) => s + i.total, 0);
    const derived = calcFromFinalPrice(totalCost, estimate.finalPrice, estimate.vatIncluded);
    totals = { totalCost, ...derived, finalPrice: estimate.finalPrice };
  } else {
    totals = calcTotals(items, estimate.marginRate, estimate.vatIncluded);
  }
  const updated = await prisma.estimate.update({
    where: { id: eid },
    data: { ...totals, marginMode: estimate.marginMode, updatedAt: new Date() },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
  });
  return NextResponse.json(updated);
}

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

  // ─── Line item actions ─────────────────────────────────────────────
  // 1. Update line item total (manual edit)
  if (body.lineItemId && body.total !== undefined) {
    await prisma.estimateLineItem.update({
      where: { id: body.lineItemId },
      data: { total: body.total, isUserEdited: true },
    });
    return recalcAndReturn(eid, estimate);
  }

  // 2. Undo line item edit → restore total = quantity × unitPrice
  if (body.lineItemId && body.action === "undo") {
    const line = estimate.lineItems.find((l) => l.id === body.lineItemId);
    if (!line) return NextResponse.json({ error: "Line not found" }, { status: 404 });
    await prisma.estimateLineItem.update({
      where: { id: body.lineItemId },
      data: { total: Math.round(line.quantity * line.unitPrice), isUserEdited: false },
    });
    return recalcAndReturn(eid, estimate);
  }

  // 3. Delete a line item
  if (body.lineItemId && body.action === "delete") {
    await prisma.estimateLineItem.delete({ where: { id: body.lineItemId } });
    return recalcAndReturn(eid, estimate);
  }

  // 4. Add a new line item (free-form, isUserEdited=true)
  if (body.action === "add" && body.newLineItem) {
    const { name, quantity, unit, unitPrice, category } = body.newLineItem;
    const total = Math.round((quantity ?? 1) * (unitPrice ?? 0));
    const maxOrder = Math.max(0, ...estimate.lineItems.map((l) => l.sortOrder));
    await prisma.estimateLineItem.create({
      data: {
        estimateId: eid,
        category: category ?? "other",
        name: name || "기타 항목",
        quantity: quantity ?? 1,
        unit: unit ?? "식",
        unitPrice: unitPrice ?? 0,
        total,
        isUserEdited: true,
        sortOrder: maxOrder + 1,
      },
    });
    return recalcAndReturn(eid, estimate);
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

export async function DELETE(_: Request, { params }: { params: Promise<{ eid: string }> }) {
  const { eid } = await params;
  // EstimateLineItem has onDelete: Cascade in the schema, so children go automatically
  await prisma.estimate.delete({ where: { id: eid } });
  return NextResponse.json({ ok: true });
}
