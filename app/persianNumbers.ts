export function toAsciiDigits(value: string): string {
  return value.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

export function toPersianDigits(value: string | number): string {
  return toAsciiDigits(String(value)).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!);
}

export function localizeInputDigits(input: HTMLInputElement): string {
  const value = toPersianDigits(input.value);
  if (value !== input.value) {
    // Digit replacement keeps the length; update before React so it won't move the caret to the end.
    const { selectionStart, selectionEnd, selectionDirection } = input;
    input.value = value;
    if (selectionStart !== null && selectionEnd !== null) input.setSelectionRange(selectionStart, selectionEnd, selectionDirection ?? undefined);
  }
  return value;
}
