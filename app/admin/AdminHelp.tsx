import { useId, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";

export function AdminHelp({ label, children }: { label: string; children: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  function show() {
    const bounds = button.current!.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth * 0.75);
    setLeft(Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8)) - bounds.left);
    setOpen(true);
  }
  return <span className="admin-help" onMouseEnter={show} onMouseLeave={(e) => { if (!e.currentTarget.contains(document.activeElement)) setOpen(false); }}>
    <button ref={button} type="button" className="admin-help-button" aria-label={`راهنمای ${label}`} aria-describedby={open ? id : undefined}
      onFocus={show} onBlur={() => setOpen(false)} onClick={show}
      onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); e.preventDefault(); e.stopPropagation(); } }}>
      <CircleHelp size={17} aria-hidden="true" />
    </button>
    {open ? <span id={id} role="tooltip" dir="rtl" className="admin-help-tooltip" style={{ left }}>{children}</span> : null}
  </span>;
}
