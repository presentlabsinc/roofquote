import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, requireUserAndSettings } from "@/lib/auth";
import { calcTotals, calcFromFinalPrice, calcFromSupplyPrice } from "@/lib/calculations";
import {
  InputError, assertMoneyFitsDb, computeEstimate, estimateColumns, parseEstimateBody, parseMarginRate, snapshotColumns,
} from "@/lib/estimate-input";
import { removeForEstimates } from "@/lib/sent-pdf";
import type { Estimate } from "@prisma/client";

const LINE_CATEGORIES = ["material", "labor", "equipment", "transport", "meals", "lodging", "waste", "removal", "other"];
const MAX_WON = 100_000_000_000; // 1,000억 — 오타 방지 상한

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** 원 단위 정수 금액 검증. */
function won(v: unknown, label: string, min = -MAX_WON): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new InputError(`${label} 값이 올바르지 않습니다`);
  const r = Math.round(n);
  if (r < min || r > MAX_WON) throw new InputError(`${label} 값이 범위를 벗어났습니다`);
  return r;
}

/**
 * 라인 변경 후 합계 재계산. 사용자가 고정한 기준을 유지한다:
 *   finalPrice 모드 → 최종가 고정, 마진 역산 ("850만원 약속")
 *   amount 모드     → 마진 금액 고정 (평당가·마진 금액 입력 후 라인을 고쳐도 유지 — 2026-09-28)
 *   percent 모드    → 마진율 고정
 */
async function recalcAndReturn(eid: string, estimate: Estimate) {
  const items = await prisma.estimateLineItem.findMany({ where: { estimateId: eid } });
  const totalCost = items.reduce((s, i) => s + i.total, 0);
  let totals;
  if (estimate.marginMode === "finalPrice") {
    const derived = calcFromFinalPrice(totalCost, estimate.finalPrice, estimate.vatIncluded);
    totals = { totalCost, ...derived, finalPrice: estimate.finalPrice };
  } else if (estimate.marginMode === "amount" && totalCost + estimate.marginAmount > 0) {
    // (공급가가 0 이하가 되면 — 손해 견적에서 라인을 줄인 경우 — 아래 마진율 기준으로 떨어뜨린다)
    const supplyPrice = totalCost + estimate.marginAmount;
    const vat = Math.round(supplyPrice * 0.1);
    totals = {
      totalCost,
      marginAmount: estimate.marginAmount,
      marginRate: supplyPrice > 0 ? estimate.marginAmount / supplyPrice : 0,
      supplyPrice,
      vat,
      finalPrice: estimate.vatIncluded ? supplyPrice + vat : supplyPrice,
    };
  } else {
    totals = calcTotals(items, estimate.marginRate, estimate.vatIncluded);
  }
  const updated = await prisma.estimate.update({
    where: { id: eid },
    data: { ...totals, marginMode: estimate.marginMode, vatIncluded: estimate.vatIncluded, updatedAt: new Date() },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
  });
  return NextResponse.json(updated);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ eid: string }> }) {
  const user = await requireUser();
  const { eid } = await params;
  let body: Record<string, unknown>;
  try {
    const raw = await req.json();
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return bad("요청 형식이 올바르지 않습니다");
    body = raw as Record<string, unknown>;
  } catch {
    return bad("요청 형식이 올바르지 않습니다");
  }

  const estimate = await prisma.estimate.findFirst({
    where: { id: eid, site: { userId: user.id } },
    include: { lineItems: true, site: true },
  });
  if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    // ─── Line item actions ─────────────────────────────────────────────
    // 라인 ID 는 반드시 이 견적 소속이어야 한다 (2026-09-28 보안 수정 — 이전엔 URL 의 견적만
    // 소유권 확인하고 본문의 lineItemId 는 확인하지 않아 다른 사용자의 라인을 고칠 수 있었다).
    const lineId = typeof body.lineItemId === "string" ? body.lineItemId : null;
    const line = lineId ? estimate.lineItems.find((l) => l.id === lineId) : undefined;
    if (lineId && !line) return NextResponse.json({ error: "Line not found" }, { status: 404 });

    // 1. Update line item total (manual edit)
    if (line && body.total !== undefined) {
      const total = won(body.total, "금액");
      await prisma.estimateLineItem.updateMany({
        where: { id: line.id, estimateId: eid },
        data: { total, isUserEdited: true },
      });
      return recalcAndReturn(eid, estimate);
    }

    // 2. Undo line item edit → restore total = quantity × unitPrice
    if (line && body.action === "undo") {
      await prisma.estimateLineItem.updateMany({
        where: { id: line.id, estimateId: eid },
        data: { total: Math.round(line.quantity * line.unitPrice), isUserEdited: false },
      });
      return recalcAndReturn(eid, estimate);
    }

    // 3. Delete a line item
    if (line && body.action === "delete") {
      await prisma.estimateLineItem.deleteMany({ where: { id: line.id, estimateId: eid } });
      return recalcAndReturn(eid, estimate);
    }

    // 4. Add a new line item (free-form, isUserEdited=true)
    if (body.action === "add" && typeof body.newLineItem === "object" && body.newLineItem !== null) {
      const n = body.newLineItem as Record<string, unknown>;
      const name = typeof n.name === "string" ? n.name.trim().slice(0, 100) : "";
      const quantity = n.quantity === undefined || n.quantity === null || n.quantity === "" ? 1 : Number(n.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) return bad("수량이 올바르지 않습니다");
      const unitPrice = won(n.unitPrice ?? 0, "단가", 0);
      const category = typeof n.category === "string" && LINE_CATEGORIES.includes(n.category) ? n.category : "other";
      const unit = typeof n.unit === "string" && n.unit.trim() ? n.unit.trim().slice(0, 20) : "식";
      const maxOrder = Math.max(0, ...estimate.lineItems.map((l) => l.sortOrder));
      await prisma.estimateLineItem.create({
        data: {
          estimateId: eid,
          category,
          name: name || "기타 항목",
          quantity,
          unit,
          unitPrice,
          total: Math.round(quantity * unitPrice),
          isUserEdited: true,
          sortOrder: maxOrder + 1,
        },
      });
      return recalcAndReturn(eid, estimate);
    }

    // ─── 5. Full edit (replace) = 재발행 ─────────────────────────────────
    // 라인 전체를 현재 설정(+견적별 override)으로 다시 만들고, 회사·고객·마진 분배 비율·발행일을
    // 다시 스냅샷한다. 마진은 percent 모드로 초기화 (확인 다이얼로그에 고지됨).
    // estimateNumber · pdfSentAt 은 유지.
    if (body.action === "replace") {
      const { settings } = await requireUserAndSettings();
      const input = parseEstimateBody(body);
      const marginRate = input.marginRate ?? settings.defaultMarginRate;
      const vatIncl = input.vatIncluded ?? estimate.vatIncluded;
      const { lineItemDrafts, effectiveLossRate } = computeEstimate(settings, input);
      const totals = calcTotals(lineItemDrafts, marginRate, vatIncl);
      // 생성과 같은 저장 범위 확인 — 넘으면 InputError → 아래 catch 가 400 (이전엔 DB 오류로 500).
      assertMoneyFitsDb(lineItemDrafts, totals);
      const now = new Date();

      await prisma.$transaction(async (tx) => {
        await tx.estimateLineItem.deleteMany({ where: { estimateId: eid } });
        await tx.estimate.update({
          where: { id: eid },
          data: {
            ...estimateColumns(input, effectiveLossRate),
            ...totals,
            marginMode: "percent",
            marginRate,
            vatIncluded: vatIncl,
            paymentTerms: input.paymentTerms ?? estimate.paymentTerms,
            validityDays: input.validityDays ?? estimate.validityDays,
            ...snapshotColumns(settings, estimate.site, now),
            updatedAt: now,
          },
        });
        await tx.estimateLineItem.createMany({
          data: lineItemDrafts.map((d) => ({ ...d, estimateId: eid })),
        });
      });

      const updated = await prisma.estimate.findFirst({
        where: { id: eid, site: { userId: user.id } },
        include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
      });
      return NextResponse.json(updated);
    }

    // 6. Update margin rate (매출 대비, -100% ~ 99%)
    if (body.marginRate !== undefined) {
      const marginRate = parseMarginRate(body.marginRate);
      const items = await prisma.estimateLineItem.findMany({ where: { estimateId: eid } });
      const totals = calcTotals(items, marginRate, estimate.vatIncluded);
      const updated = await prisma.estimate.update({
        where: { id: eid },
        data: { ...totals, marginRate, marginMode: "percent", updatedAt: new Date() },
        include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
      });
      return NextResponse.json(updated);
    }

    // 7. Update margin amount directly — marginRate 는 매출(공급가) 대비로 역산.
    if (body.marginAmount !== undefined) {
      const marginAmount = won(body.marginAmount, "마진 금액");
      const supplyPrice = estimate.totalCost + marginAmount;
      if (supplyPrice <= 0) return bad("마진 금액이 너무 작습니다 (공급가가 0 이하)");
      const vat = Math.round(supplyPrice * 0.1);
      const finalPrice = estimate.vatIncluded ? supplyPrice + vat : supplyPrice;
      const marginRate = marginAmount / supplyPrice;
      const updated = await prisma.estimate.update({
        where: { id: eid },
        data: { marginAmount, marginRate, supplyPrice, vat, finalPrice, marginMode: "amount", updatedAt: new Date() },
        include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
      });
      return NextResponse.json(updated);
    }

    // 7b. 평당가 입력 → 공급가 지정. 마진은 **서버의 현재 원가** 기준으로 역산 (mode 'amount').
    //     클라이언트가 계산한 마진 차액을 보내면, 화면이 오래된 상태일 때 입력한 평당가와 다른
    //     공급가가 저장됐다 (2026-09-28).
    //     계산은 번개 견적과 같은 calcFromSupplyPrice (2026-10-01).
    if (body.supplyPrice !== undefined) {
      const supplyPrice = won(body.supplyPrice, "공급가", 1);
      const updated = await prisma.estimate.update({
        where: { id: eid },
        data: {
          ...calcFromSupplyPrice(estimate.totalCost, supplyPrice, estimate.vatIncluded),
          marginMode: "amount", updatedAt: new Date(),
        },
        include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
      });
      return NextResponse.json(updated);
    }

    // 8. Update final price (back-calculate)
    if (body.finalPrice !== undefined) {
      const finalPrice = won(body.finalPrice, "최종 견적가", 1);
      const derived = calcFromFinalPrice(estimate.totalCost, finalPrice, estimate.vatIncluded);
      const updated = await prisma.estimate.update({
        where: { id: eid },
        data: { finalPrice, ...derived, marginMode: "finalPrice", updatedAt: new Date() },
        include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
      });
      return NextResponse.json(updated);
    }

    // 9. VAT toggle — 공급가(원가+마진)는 그대로, 부가세를 더할지만 바꾼다. 최종가 고정 모드에서도
    //    최종가를 고정하면 마진이 10% 만큼 조용히 바뀌므로 공급가를 유지하고 최종가를 다시 계산
    //    (2026-09-28 리뷰). 모드는 그대로 두어 이후 라인 수정은 새 최종가를 기준으로 유지.
    if (body.vatIncluded !== undefined) {
      if (typeof body.vatIncluded !== "boolean") return bad("부가세 값이 올바르지 않습니다");
      const vat = Math.round(estimate.supplyPrice * 0.1);
      const updated = await prisma.estimate.update({
        where: { id: eid },
        data: {
          vatIncluded: body.vatIncluded,
          vat,
          finalPrice: body.vatIncluded ? estimate.supplyPrice + vat : estimate.supplyPrice,
          updatedAt: new Date(),
        },
        include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
      });
      return NextResponse.json(updated);
    }

    // 10. Meta update (paymentTerms, validityDays, pdfSentAt) — 타입 검증 후 반영.
    //     pdfUrl 은 서버(/api/estimates/[eid]/sent-pdf)만 쓴다 — 본문의 pdfUrl 은 무시.
    const updateData: Record<string, unknown> = {};
    if (body.paymentTerms !== undefined) {
      if (typeof body.paymentTerms !== "string" || body.paymentTerms.length > 500) return bad("결제 조건 값이 올바르지 않습니다");
      updateData.paymentTerms = body.paymentTerms;
    }
    if (body.validityDays !== undefined) {
      const d = Number(body.validityDays);
      if (!Number.isInteger(d) || d < 1 || d > 365) return bad("유효기간은 1~365일이어야 합니다");
      updateData.validityDays = d;
    }
    if (body.pdfSentAt !== undefined) {
      const t = body.pdfSentAt === null ? null : new Date(String(body.pdfSentAt));
      if (t !== null && Number.isNaN(t.getTime())) return bad("pdfSentAt 값이 올바르지 않습니다");
      updateData.pdfSentAt = t;
    }
    if (Object.keys(updateData).length > 0) {
      const updated = await prisma.estimate.update({
        where: { id: eid },
        data: { ...updateData, updatedAt: new Date() },
        include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
      });
      return NextResponse.json(updated);
    }

    return bad("Nothing to update");
  } catch (e) {
    if (e instanceof InputError) return bad(e.message);
    throw e;
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ eid: string }> }) {
  const user = await requireUser();
  const { eid } = await params;
  // Atomic ownership check via deleteMany — returns 0 affected if not owned.
  // EstimateLineItem has onDelete: Cascade so children go automatically.
  const result = await prisma.estimate.deleteMany({
    where: { id: eid, site: { userId: user.id } },
  });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // 보관한 발송 PDF 도 정리 (best-effort — 실패해도 삭제 응답은 성공).
  await removeForEstimates(user.id, [eid]);
  return NextResponse.json({ ok: true });
}
