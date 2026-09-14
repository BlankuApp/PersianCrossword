import { Fragment, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { buildAskPrompt, buildExplainPrompt, streamGemini } from "../gemini";
import { loadGeminiKey, saveGeminiKey } from "../progress";

function renderInline(line: string): ReactNode {
  const parts = line.split(/(\*\*.+?\*\*|`.+?`)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

// Minimal renderer for the markdown Gemini tends to reply with (bold, code, bullet/numbered lists,
// headings). Not a full markdown parser — no nested lists, links, tables, etc.
function renderMarkdown(text: string): ReactNode {
  const blocks = text.split(/\n{2,}/);
  return blocks.map((block, i) => {
    const lines = block.split("\n").filter((l) => l.trim());
    if (lines.length === 0) return null;

    if (lines.every((l) => /^[-*]\s/.test(l))) {
      return (
        <ul key={i}>
          {lines.map((l, j) => <li key={j}>{renderInline(l.replace(/^[-*]\s/, ""))}</li>)}
        </ul>
      );
    }
    if (lines.every((l) => /^\d+[.)]\s/.test(l))) {
      return (
        <ol key={i}>
          {lines.map((l, j) => <li key={j}>{renderInline(l.replace(/^\d+[.)]\s/, ""))}</li>)}
        </ol>
      );
    }
    if (/^#{1,6}\s/.test(lines[0] ?? "")) {
      return <h3 key={i}>{renderInline((lines[0] ?? "").replace(/^#{1,6}\s/, ""))}</h3>;
    }
    return (
      <p key={i}>
        {lines.map((l, j) => <Fragment key={j}>{j > 0 ? <br /> : null}{renderInline(l)}</Fragment>)}
      </p>
    );
  });
}

interface ClueAiButtonProps {
  readonly clue: string;
  readonly isSolved: boolean;
  readonly cellValues: readonly (string | undefined)[];
  readonly answer: string;
}

export function ClueAiButton({ clue, isSolved, cellValues, answer }: ClueAiButtonProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error" | "no-key">("idle");
  const [controller, setController] = useState<AbortController | null>(null);
  const [keyInput, setKeyInput] = useState(loadGeminiKey);

  const label = isSolved ? "توضیح با هوشواره" : "از هوشواره بپرس";
  const title = isSolved ? `توضیح هوشواره دربارهٔ «${answer}»` : "پاسخ پیشنهادی هوشواره";

  function close(): void {
    controller?.abort();
    setOpen(false);
  }

  async function runRequest(apiKey: string): Promise<void> {
    setText("");
    const prompt = isSolved ? buildExplainPrompt(clue, answer) : buildAskPrompt(clue, cellValues);
    const ac = new AbortController();
    setController(ac);
    setStatus("loading");
    try {
      await streamGemini(prompt, apiKey, (chunk) => setText((t) => t + chunk), ac.signal);
      setStatus("done");
    } catch (e) {
      if (ac.signal.aborted) return;
      setText(e instanceof Error ? e.message : "خطایی رخ داد.");
      setStatus("error");
    }
  }

  function start(): void {
    setOpen(true);
    setKeyInput(loadGeminiKey());
    const apiKey = loadGeminiKey();
    if (!apiKey) {
      setStatus("no-key");
      return;
    }
    void runRequest(apiKey);
  }

  function submitKey(): void {
    const apiKey = keyInput.trim();
    if (!apiKey) return;
    saveGeminiKey(apiKey);
    void runRequest(apiKey);
  }

  return (
    <>
      <button type="button" onClick={start} className="clue-search-link" title={label}>
        ✨ {label}
      </button>

      {open ? (
        <div className="solution-modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={close}>
          <div className="solution-modal clue-ai-modal" onClick={(e) => e.stopPropagation()}>
            <div className="solution-modal-header">
              <h2>{title}</h2>
              <div className="solution-modal-actions">
                <button type="button" className="solution-close-button" onClick={close} title="بستن" aria-label="بستن">
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
            </div>
            {status === "no-key" ? (
              <div className="clue-ai-key-form" dir="rtl">
                <label htmlFor="clue-ai-key">کلید هوشواره (Gemini)</label>
                <input
                  id="clue-ai-key"
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitKey()}
                  placeholder="کلید API خود را این‌جا وارد کنید"
                  dir="ltr"
                  autoFocus
                />
                <p className="auth-gemini-hint">
                  یک کلید رایگان از{" "}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                    Google AI Studio
                  </a>{" "}
                  بسازید. این کلید فقط در همین مرورگر شما ذخیره می‌شود و به هیچ سروری ارسال نمی‌شود.
                </p>
                <button type="button" className="auth-btn" onClick={submitKey} disabled={!keyInput.trim()}>
                  ذخیره و دریافت پاسخ
                </button>
              </div>
            ) : (
              <div className="clue-ai-text" dir="rtl">
                {renderMarkdown(text)}
                {status === "loading" && !text ? <p>در حال دریافت پاسخ…</p> : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
