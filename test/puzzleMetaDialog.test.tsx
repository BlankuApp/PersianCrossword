// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PuzzleMetaDialog } from "../app/components/PuzzleMetaDialog";
import { ID_INVALID } from "../app/components/puzzleMeta";
import type { CrosswordJson } from "../src/index";
import { basicPuzzleV3 } from "./fixtures";

vi.mock("../app/puzzleLibrary", () => ({ usePuzzleLibrary: () => ({ puzzles: [] }) }));

const json: CrosswordJson = { ...basicPuzzleV3, meta: { id: "p1", title: "عنوان", difficulty: "عادی", sourceFile: "src.png", size: { rows: 3, cols: 4 } } };
const SAVE = { name: "ذخیره مشخصات" };

function setup(props: Partial<Parameters<typeof PuzzleMetaDialog>[0]> = {}) {
  const onSave = vi.fn(async () => {});
  const onClose = vi.fn();
  render(<PuzzleMetaDialog json={json} id="p1" kind="draft" takenIds={new Set(["p1", "p2"])} hasSourceImage onSave={onSave} onClose={onClose} {...props} />);
  return { onSave, onClose, dialog: screen.getByRole("dialog", { name: "مشخصات جدول" }) };
}
const field = (label: string) => screen.getByLabelText(label);

describe("PuzzleMetaDialog", () => {
  it("enables Save only once something changed and saves the updated JSON with the id", async () => {
    const { onSave, onClose } = setup();
    expect(screen.getByRole("button", SAVE)).toBeDisabled();
    fireEvent.change(field("عنوان"), { target: { value: "  تازه  " } });
    await userEvent.click(screen.getByRole("button", SAVE));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ id: "p1", title: "تازه", size: { rows: 3, cols: 4 } }) }), "p1");
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("lets Save repair puzzles whose meta size or id is wrong or missing", () => {
    setup({ json: { ...json, meta: { title: "عنوان", size: { rows: 9, cols: 9 } } } });
    expect(screen.getByRole("button", SAVE)).toBeEnabled();
  });

  it("blocks Save for an invalid id, a used id and a missing title, but allows a new id", () => {
    setup();
    fireEvent.change(field("شناسهٔ جدول"), { target: { value: "bad/id" } });
    expect(screen.getByRole("button", SAVE)).toBeDisabled();
    fireEvent.change(field("شناسهٔ جدول"), { target: { value: "p2" } });
    expect(screen.getByRole("alert")).toHaveTextContent("قبلاً استفاده شده");
    expect(screen.getByRole("button", SAVE)).toBeDisabled();
    fireEvent.change(field("شناسهٔ جدول"), { target: { value: "p3" } });
    expect(screen.getByRole("button", SAVE)).toBeEnabled();
    fireEvent.change(field("عنوان"), { target: { value: "  " } });
    expect(screen.getByRole("button", SAVE)).toBeDisabled();
  });

  it("says why Save is disabled when a draft's id is emptied", () => {
    setup();
    fireEvent.change(field("شناسهٔ جدول"), { target: { value: "" } });
    expect(screen.getByRole("dialog")).toHaveTextContent(ID_INVALID);
    expect(screen.getByRole("button", SAVE)).toBeDisabled();
  });

  it("passes the changed id to onSave", async () => {
    const { onSave } = setup();
    fireEvent.change(field("شناسهٔ جدول"), { target: { value: "۸۰۵۰" } });
    await userEvent.click(screen.getByRole("button", SAVE));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ id: "8050" }) }), "8050");
  });

  it("keeps the id read-only for a published puzzle and explains the effect", () => {
    setup({ kind: "published" });
    expect(field("شناسهٔ جدول")).toHaveAttribute("readonly");
    expect(screen.getByRole("dialog")).toHaveTextContent("بلافاصله برای همهٔ بازیکنان");
  });

  it("says a draft change stays private", () => {
    setup();
    expect(screen.getByRole("dialog")).toHaveTextContent("تا زمان انتشار");
  });

  it("closes at once when nothing changed, and asks before discarding edits", async () => {
    const clean = setup();
    await userEvent.click(screen.getByRole("button", { name: "انصراف" }));
    expect(clean.onClose).toHaveBeenCalledOnce();
  });

  it("asks before discarding edits (Cancel, Escape) and the backdrop does not close a dirty dialog", async () => {
    const { onClose, dialog } = setup();
    fireEvent.change(field("عنوان"), { target: { value: "تغییر" } });
    fireEvent.click(dialog); // backdrop
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "انصراف" }));
    expect(within(dialog).getByText("تغییرات ذخیره‌نشده دور ریخته شود؟")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ادامهٔ ویرایش" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" }); // back to the form, not closed
    expect(screen.queryByText("تغییرات ذخیره‌نشده دور ریخته شود؟")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "انصراف" }));
    await userEvent.click(screen.getByRole("button", { name: "ادامهٔ ویرایش" }));
    expect(field("عنوان")).toHaveValue("تغییر");
    fireEvent.keyDown(field("عنوان"), { key: "Escape" });
    expect(screen.getByText("تغییرات ذخیره‌نشده دور ریخته شود؟")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "دور انداختن" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows a failed save, stays open with the edits and can retry", async () => {
    const { onSave, onClose } = setup();
    onSave.mockRejectedValueOnce(new Error("خطای ارتباط"));
    fireEvent.change(field("عنوان"), { target: { value: "تازه" } });
    await userEvent.click(screen.getByRole("button", SAVE));
    expect(await screen.findByRole("alert")).toHaveTextContent("خطای ارتباط");
    expect(onClose).not.toHaveBeenCalled();
    expect(field("عنوان")).toHaveValue("تازه");
    expect(screen.getByRole("button", SAVE)).toBeEnabled();
    await userEvent.click(screen.getByRole("button", SAVE));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("disables Save while saving so a double click saves once", async () => {
    let finish!: () => void;
    const onSave = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const { onClose } = setup({ onSave });
    fireEvent.change(field("عنوان"), { target: { value: "تازه" } });
    await userEvent.click(screen.getByRole("button", SAVE));
    expect(screen.getByRole("button", { name: "در حال ذخیره…" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(onSave).toHaveBeenCalledOnce();
    finish();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("keeps an unusual difficulty and numeric author through a title edit", async () => {
    const odd = { ...json, meta: { ...json.meta, difficulty: "سخت", author: 12 as unknown as string } };
    const { onSave } = setup({ json: odd });
    expect(field("سطح")).toHaveValue("سخت");
    fireEvent.change(field("عنوان"), { target: { value: "تازه" } });
    await userEvent.click(screen.getByRole("button", SAVE));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ difficulty: "سخت", author: "12" }) }), "p1");
  });

  it("focuses the first editable field and gives focus back on close", () => {
    const opener = document.createElement("button");
    document.body.append(opener); opener.focus();
    const view = render(<PuzzleMetaDialog json={json} id="p1" kind="published" hasSourceImage={false} onSave={async () => {}} onClose={() => {}} />);
    expect(screen.getByLabelText("عنوان")).toHaveFocus(); // id is read-only on published puzzles
    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
