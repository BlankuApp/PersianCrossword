import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import type { CrosswordJson } from "../../src/index";
import { useAuth } from "../AuthContext";
import { SolverPage, type PuzzleEditor } from "../pages/SolverPage";
import { refreshPuzzleCatalog } from "../puzzleSync";
import { navigate } from "../router";
import { publishDraft, saveDraft } from "./adminApi";
import { gridKey } from "./gridKey";
import { useDrafts } from "./useDrafts";

const backToAdmin = () => navigate("#/admin");

// A draft opened in the solver with the editing tools: saves stay private until it's published.
export default function DraftPage({ id }: { id: string }) {
  const { isAdmin } = useAuth();
  const { drafts, loaded } = useDrafts();
  const draft = drafts.find((d) => d.id === id);

  const editor = useMemo((): PuzzleEditor | undefined => {
    if (!draft) return undefined;
    return {
      kind: "draft",
      save: (json: CrosswordJson) => saveDraft(draft, json),
      publish: async (json: CrosswordJson) => {
        await publishDraft(draft, json);
        await refreshPuzzleCatalog();
        navigate(`#/puzzle/${encodeURIComponent(draft.id)}`);
      },
    };
  }, [draft]);

  if (!isAdmin || !loaded || !draft || !editor) {
    return (
      <main className="app-shell home-shell admin-shell" dir="rtl">
        <header className="admin-header">
          <button type="button" className="header-back" onClick={backToAdmin} title="بازگشت به پنل مدیریت" aria-label="بازگشت به پنل مدیریت">
            <ArrowRight size={20} aria-hidden="true" />
          </button>
          <h1>پیش‌نویس {id}</h1>
        </header>
        <p className="admin-note">{isAdmin && !loaded ? "در حال بارگذاری…" : "این پیش‌نویس پیدا نشد."}</p>
      </main>
    );
  }

  return (
    <SolverPage
      // Grid changes (saved answers) start a fresh page; clue edits keep the current one.
      key={`${draft.id}:${gridKey(draft.json)}`}
      id={draft.id}
      json={draft.json}
      solutionImageUrl={draft.solutionImageUrl}
      sourceImageUrl={draft.sourceImageUrl}
      editor={editor}
      onBack={backToAdmin}
    />
  );
}
