// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { MetaSummary } from "../app/components/MetaSummary";
import { PuzzleMetaEditor, type PuzzleMetaEditorProps } from "../app/components/PuzzleMetaEditor";
import type { PuzzleMetaForm } from "../app/components/puzzleMeta";
import { basicPuzzleV3 } from "./fixtures";

vi.mock("../app/puzzleLibrary", () => ({ usePuzzleLibrary: () => ({ puzzles: [{ id: "x", title: "قدیمی", newspaper: "همشهری", author: "آ" }] }) }));

const start: PuzzleMetaForm = { id: "p1", title: "عنوان", newspaper: "", difficulty: "عادی", author: "", sourceFile: "src.png" };
function Harness(props: Partial<PuzzleMetaEditorProps> & { onForm?: (f: PuzzleMetaForm) => void }) {
  const [value, setValue] = useState(start);
  return <PuzzleMetaEditor value={value} onChange={(next) => { setValue(next); props.onForm?.(next); }} sourceFile="editable" size={{ rows: 3, cols: 4 }} {...props} />;
}

describe("PuzzleMetaEditor", () => {
  it("shows the main fields and edits them with Persian digits shown, ASCII ids stored", () => {
    const onForm = vi.fn();
    render(<Harness onForm={onForm} />);
    fireEvent.change(screen.getByLabelText("شناسهٔ جدول"), { target: { value: "8050-a" } });
    expect(screen.getByLabelText("شناسهٔ جدول")).toHaveValue("۸۰۵۰-a");
    expect(onForm).toHaveBeenLastCalledWith(expect.objectContaining({ id: "8050-a" }));
    fireEvent.change(screen.getByLabelText("عنوان"), { target: { value: "جدول 12" } });
    expect(screen.getByLabelText("عنوان")).toHaveValue("جدول ۱۲");
    for (const label of ["روزنامه", "طراح"]) expect(screen.getByLabelText(label)).toBeInTheDocument();
  });

  it("offers the two difficulty levels, keeps an unknown value as an extra option", () => {
    const { unmount } = render(<Harness />);
    expect([...screen.getByLabelText("سطح").querySelectorAll("option")].map((o) => o.value)).toEqual(["عادی", "ویژه"]);
    unmount();
    render(<PuzzleMetaEditor value={{ ...start, difficulty: "سخت" }} onChange={() => {}} sourceFile="none" size={undefined} />);
    expect(screen.getByLabelText("سطح")).toHaveValue("سخت");
  });

  it("flags an invalid or used id, but not the puzzle's own id, and can hide the problem", () => {
    const takenIds = new Set(["p1", "p2"]);
    const { rerender } = render(<PuzzleMetaEditor value={{ ...start, id: "p2" }} onChange={() => {}} takenIds={takenIds} ownId="p1" sourceFile="none" size={undefined} />);
    expect(screen.getByRole("alert")).toHaveTextContent("قبلاً استفاده شده");
    expect(screen.getByLabelText("شناسهٔ جدول")).toHaveAttribute("aria-invalid", "true");
    rerender(<PuzzleMetaEditor value={{ ...start, id: "p1" }} onChange={() => {}} takenIds={takenIds} ownId="p1" sourceFile="none" size={undefined} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    rerender(<PuzzleMetaEditor value={{ ...start, id: "bad/id" }} onChange={() => {}} sourceFile="none" size={undefined} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    rerender(<PuzzleMetaEditor value={{ ...start, id: "bad/id" }} onChange={() => {}} sourceFile="none" size={undefined} hideIdProblem />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("makes the id read-only when locked", () => {
    render(<Harness idLocked />);
    expect(screen.getByLabelText("شناسهٔ جدول")).toHaveAttribute("readonly");
  });

  it("keeps size, publication date and source file in a collapsed advanced section", () => {
    const { container } = render(<Harness publishedAt={undefined} />);
    const details = container.querySelector("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText("پیشرفته")).toBeInTheDocument();
    expect(details).toHaveTextContent("۳ × ۴");
    expect(details).toHaveTextContent("هنگام انتشار ثبت می‌شود");
    expect(within(details).getByLabelText("نام تصویر منبع")).toBeEnabled();
  });

  it("shows a given publication date and disables the source file unless editable", () => {
    const { container, rerender } = render(<PuzzleMetaEditor value={start} onChange={() => {}} sourceFile="none" size={{ rows: 3, cols: 4 }} publishedAt="2026-01-02" />);
    expect(container).toHaveTextContent("۲۰۲۶-۰۱-۰۲");
    expect(screen.getByLabelText("نام تصویر منبع")).toBeDisabled();
    expect(container).toHaveTextContent("تصویر منبع ندارد");
    rerender(<PuzzleMetaEditor value={start} onChange={() => {}} sourceFile="auto" size={undefined} />);
    expect(screen.getByLabelText("نام تصویر منبع")).toBeDisabled();
    expect(container).toHaveTextContent("از شناسه ساخته می‌شود");
  });
});

describe("MetaSummary", () => {
  it("lists the filled metadata and offers the edit action", async () => {
    const onEdit = vi.fn();
    const json = { ...basicPuzzleV3, meta: { title: "عنوان ۱", difficulty: "ویژه", author: 12 as unknown as string } };
    render(<MetaSummary json={json} id="p9" onEdit={onEdit} />);
    expect(screen.getByText("عنوان ۱")).toBeInTheDocument();
    expect(screen.getByText("p9")).toBeInTheDocument();
    expect(screen.getByText("۱۲")).toBeInTheDocument();
    expect(screen.queryByText("روزنامه")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ویرایش مشخصات" }));
    expect(onEdit).toHaveBeenCalledOnce();
  });
  it("omits the edit action without a handler", () => {
    render(<MetaSummary json={basicPuzzleV3} id="p9" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
