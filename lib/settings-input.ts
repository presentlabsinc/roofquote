import { Prisma } from "@prisma/client";

/**
 * PricingSettings 쓰기 검증 (서버 전용) — 설정 저장·프리셋 적용 공용 (2026-09-28).
 *
 * 이전엔 /api/settings 가 본문에서 id·userId 만 지우고 나머지를 그대로 Prisma 에 넘겨,
 * 음수 단가·NaN·문자열 숫자가 저장되면 이후 모든 견적이 깨질 수 있었다 (외부 감사 L5).
 * 스키마(Prisma DMMF)의 필드 목록·타입을 기준으로:
 *   - 모르는 키 / 쓰기 금지 키 → 버림
 *   - Int/Float → 유한수, 0 이상 (예외: 마진율 -1~0.99), 과도한 값 거부
 *   - String → 길이 제한, nullable 이면 "" → null
 *   - Json → 알려진 맵은 {키: 0 이상 숫자} 로 정리
 */

export class SettingsInputError extends Error {}

const WRITE_FORBIDDEN = new Set(["id", "userId", "updatedAt", "createdAt", "baselineData"]);
const MAX_NUMBER = 100_000_000_000;

/** {key: number ≥ 0} 형태여야 하는 JSON 맵. */
const NUMERIC_MAPS = new Set([
  "materialWidths", "accessoryLengths", "insulationUnitAreas",
  "catalogPrices", "thicknessMultipliers", "roofShapeLossRates",
]);

type FieldMeta = { type: string; isRequired: boolean };

let cachedFields: Map<string, FieldMeta> | null = null;
function settingsFields(): Map<string, FieldMeta> {
  if (cachedFields) return cachedFields;
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "PricingSettings");
  if (!model) throw new Error("PricingSettings model not found in DMMF");
  cachedFields = new Map(
    model.fields
      .filter((f) => f.kind === "scalar")
      .map((f) => [f.name, { type: f.type, isRequired: f.isRequired }]),
  );
  return cachedFields;
}

function cleanNumericMap(name: string, v: unknown): Record<string, number> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new SettingsInputError(`${name} 형식이 올바르지 않습니다`);
  }
  const out: Record<string, number> = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>).slice(0, 500)) {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > MAX_NUMBER) continue; // 잘못된 항목은 버림 (= 공장 기본)
    out[k.slice(0, 100)] = n;
  }
  return out;
}

/** catalogDefaults — {그룹: {simpleValue?: number ≥ 0, ...}} */
function cleanCatalogDefaults(v: unknown): Record<string, Record<string, unknown>> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new SettingsInputError("추가 자재 기본값 형식이 올바르지 않습니다");
  }
  const out: Record<string, Record<string, unknown>> = {};
  for (const [group, cfg] of Object.entries(v as Record<string, unknown>).slice(0, 50)) {
    if (typeof cfg !== "object" || cfg === null || Array.isArray(cfg)) continue;
    const c = cfg as Record<string, unknown>;
    const clean: Record<string, unknown> = {};
    if (typeof c.enabled === "boolean") clean.enabled = c.enabled;
    if (c.mode === "simple" || c.mode === "detailed") clean.mode = c.mode;
    if (["percent", "perSqm", "perM", "total"].includes(String(c.simpleType))) clean.simpleType = c.simpleType;
    const sv = Number(c.simpleValue);
    if (c.simpleValue !== undefined && Number.isFinite(sv) && sv >= 0 && sv <= MAX_NUMBER) clean.simpleValue = sv;
    out[group.slice(0, 50)] = clean;
  }
  return out;
}

/**
 * 원시 입력 → PricingSettings update 데이터. `partial` 이면 들어온 키만 (설정 저장),
 * 잘못된 값은 SettingsInputError. 프리셋 스냅샷처럼 신뢰도 낮은 입력은 lenient=true 로
 * 잘못된 키를 조용히 버린다 (옛 프리셋이 없어진 컬럼을 품고 있어도 활성화가 실패하지 않게).
 */
export function sanitizeSettingsData(raw: unknown, opts: { lenient?: boolean; allowActivePreset?: boolean } = {}): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    if (opts.lenient) return {};
    throw new SettingsInputError("요청 형식이 올바르지 않습니다");
  }
  const fields = settingsFields();
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (WRITE_FORBIDDEN.has(key)) continue;
    if (key === "activePresetId" && !opts.allowActivePreset) continue;
    const meta = fields.get(key);
    if (!meta) continue; // 모르는 키 (구 컬럼 포함) → 버림
    try {
      out[key] = coerce(key, meta, value);
    } catch (e) {
      if (opts.lenient) continue;
      throw e;
    }
  }
  return out;
}

function coerce(key: string, meta: FieldMeta, value: unknown): unknown {
  if (value === null || value === undefined || value === "") {
    if (!meta.isRequired) return null;
    if (meta.type === "String") return "";
    throw new SettingsInputError(`${key} 값을 입력해 주세요`);
  }
  switch (meta.type) {
    case "Int":
    case "Float": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) throw new SettingsInputError(`${key} 값이 숫자가 아닙니다`);
      if (key === "defaultMarginRate") {
        if (n < -1 || n > 0.99) throw new SettingsInputError("기본 마진율은 99% 이하여야 합니다");
      } else if (n < 0 || n > MAX_NUMBER) {
        throw new SettingsInputError(`${key} 값이 범위를 벗어났습니다`);
      }
      if (meta.type === "Int" && Math.abs(n) > 2_147_483_647) throw new SettingsInputError(`${key} 값이 너무 큽니다`);
      if (key === "estimateNumberStart" && n < 1) throw new SettingsInputError("견적 번호 시작값은 1 이상이어야 합니다");
      if (key === "defaultWorkerCount" && n < 1) throw new SettingsInputError("기본 작업 인원은 1명 이상이어야 합니다");
      if (key === "workDaysAreaDivisor" && n < 1) throw new SettingsInputError("작업일수 기준은 1 이상이어야 합니다");
      if (key === "constructionToBuildingRatio" && n <= 0) throw new SettingsInputError("시공÷건물 비는 0보다 커야 합니다");
      return meta.type === "Int" ? Math.round(n) : n;
    }
    case "Boolean":
      if (typeof value !== "boolean") throw new SettingsInputError(`${key} 값이 올바르지 않습니다`);
      return value;
    case "String": {
      if (typeof value !== "string") throw new SettingsInputError(`${key} 값이 올바르지 않습니다`);
      if (value.length > 5000) throw new SettingsInputError(`${key} 값이 너무 깁니다`);
      if (key === "lossRateMode" && value !== "auto" && value !== "manual") throw new SettingsInputError("로스율 모드 값이 올바르지 않습니다");
      if (key === "substructureMode" && value !== "wood" && value !== "steel") throw new SettingsInputError("기본 하지 값이 올바르지 않습니다");
      return value;
    }
    case "Json":
      if (NUMERIC_MAPS.has(key)) return cleanNumericMap(key, value);
      if (key === "catalogDefaults") return cleanCatalogDefaults(value);
      if (JSON.stringify(value).length > 200_000) throw new SettingsInputError(`${key} 값이 너무 큽니다`);
      return value;
    default:
      throw new SettingsInputError(`${key} 는 설정에서 바꿀 수 없습니다`);
  }
}
