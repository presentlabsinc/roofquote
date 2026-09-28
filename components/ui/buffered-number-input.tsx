"use client";
import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";

/**
 * 숫자 입력칸 — 입력 중에는 사용자가 친 글자를 그대로 두고, 값만 부모에 올린다 (2026-09-28).
 *
 * 이전 입력칸들은 매 키 입력마다 값을 반올림해 다시 그려서
 *   - % 칸에 소수점을 칠 수 없었고 ("4." → "4", 4.7% → 5%)
 *   - 칸을 지우면 기본값이 즉시 다시 채워져 뒤에 친 숫자가 이어붙었다 ("5" → "05"/"150005").
 * 포커스 중엔 로컬 문자열, 포커스가 빠지면 부모 값의 표시 형식으로 돌아간다.
 *
 * - scale: 표시 배율 (비율 0.047 을 "4.7" 로 보이려면 100)
 * - integer: 저장값을 정수로 반올림 (원 단위 금액 등)
 * - emptyValue: 칸을 비웠을 때 올릴 값. 생략하면 빈 칸은 아무것도 올리지 않음(이전 값 유지).
 */
type Props = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number | null | undefined;
  onValueChange: (v: number | undefined) => void;
  scale?: number;
  maxDecimals?: number;
  integer?: boolean;
  min?: number;
  max?: number;
  emptyValue?: number | "unset";
};

export function BufferedNumberInput({
  value, onValueChange, scale = 1, maxDecimals = 2, integer = false, min, max, emptyValue,
  onFocus, onBlur, ...rest
}: Props) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState("");

  const toDisplay = (v: number | null | undefined) => {
    if (v === null || v === undefined || !Number.isFinite(v)) return "";
    const p = 10 ** maxDecimals;
    return String(Math.round(v * scale * p) / p);
  };

  return (
    <Input
      {...rest}
      type="text"
      inputMode={integer && scale === 1 ? "numeric" : "decimal"}
      value={focused ? text : toDisplay(value)}
      onFocus={(e) => {
        setText(toDisplay(value));
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, "");
        if (!/^-?\d*\.?\d*$/.test(raw)) return; // 숫자·소수점·음수 부호만
        setText(raw);
        if (raw.trim() === "" || raw === "-" || raw === ".") {
          if (emptyValue === "unset") onValueChange(undefined);
          else if (emptyValue !== undefined) onValueChange(emptyValue);
          return;
        }
        let n = parseFloat(raw) / scale;
        if (!Number.isFinite(n)) return;
        if (min !== undefined && n < min) return;
        if (max !== undefined && n > max) return;
        if (integer) n = Math.round(n);
        onValueChange(n);
      }}
    />
  );
}
