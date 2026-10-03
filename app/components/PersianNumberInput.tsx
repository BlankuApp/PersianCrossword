import type { InputHTMLAttributes } from "react";
import { localizeInputDigits, toAsciiDigits, toPersianDigits } from "../persianNumbers";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "min" | "max"> & {
  value: number; min: number; max: number; onValueChange: (value: number) => void;
};

// Native number inputs cannot display Persian digits; keep the numeric keyboard and arrow controls.
export function PersianNumberInput({ value, min, max, onValueChange, onKeyDown, ...props }: Props) {
  return <input {...props} type="text" inputMode="numeric" role="spinbutton" dir="ltr"
    value={Number.isFinite(value) ? toPersianDigits(value) : ""}
    aria-valuenow={Number.isFinite(value) ? value : undefined} aria-valuemin={min} aria-valuemax={max}
    aria-valuetext={Number.isFinite(value) ? toPersianDigits(value) : undefined}
    onChange={(e) => {
      const digits = toAsciiDigits(e.target.value);
      if (/^[0-9]*$/.test(digits)) { localizeInputDigits(e.currentTarget); onValueChange(digits === "" ? NaN : Number(digits)); }
    }} onKeyDown={(e) => {
      onKeyDown?.(e);
      if (e.defaultPrevented || !["ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      onValueChange(Math.max(min, Math.min(max, Number.isFinite(value) ? value + (e.key === "ArrowUp" ? 1 : -1) : min)));
    }} />;
}
