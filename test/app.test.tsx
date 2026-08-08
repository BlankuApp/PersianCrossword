// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SolverPage } from "../app/pages/SolverPage";
import sample10 from "../samples/sample-10x10-garden.json";
import sample11 from "../samples/sample-11x11-city.json";
import type { CrosswordJson } from "../src/index";

const json10 = sample10 as CrosswordJson;
const json11 = sample11 as CrosswordJson;

const authState = vi.hoisted(() => ({ user: null, syncVersion: 0 }));

vi.mock("../app/AuthContext", () => ({
  useAuth: () => authState,
}));

describe("Persian crossword UI", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Prevent the first-run tutorial from auto-opening in unrelated tests.
    window.localStorage.setItem("persian-crossword-seen-tutorial", "true");
    window.location.hash = "";
    authState.user = null;
    authState.syncVersion = 0;
  });

  it("renders the puzzle title and active clue", () => {
    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    expect(screen.getByRole("heading", { name: /باغ.*۱۰ در ۱۰|sample-10x10-garden/i })).toBeInTheDocument();
    expect(screen.getByText("easy").closest(".puzzle-meta-item")).toHaveClass("puzzle-meta-item-difficulty");
    expect(screen.getAllByRole("gridcell")).toHaveLength(100);
    const activeClue = within(screen.getByLabelText("پرسش فعال"));
    expect(activeClue.getByText("۱ افقی")).toHaveClass("active-clue-label");
    expect(activeClue.getByText("نمونه افقی 1، 2 حرف")).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "نوع پرسش" })).not.toBeInTheDocument();
  });

  it("renders a different puzzle when a different id/json is given", () => {
    render(<SolverPage id="sample-11x11-city" json={json11} />);

    expect(screen.getAllByRole("gridcell")).toHaveLength(121);
  });

  it("toggles direction when clicking an intersecting cell twice", async () => {
    const user = userEvent.setup();
    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    const firstCell = screen.getByLabelText("ردیف 1 ستون 10");
    expect(within(screen.getByLabelText("پرسش فعال")).getByText("نمونه افقی 1، 2 حرف")).toBeInTheDocument();

    await user.click(firstCell);
    expect(within(screen.getByLabelText("پرسش فعال")).getByText("نمونه عمودی 1، 4 حرف")).toBeInTheDocument();
  });

  it("types one Persian character and advances through the active word", async () => {
    const user = userEvent.setup();
    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    const firstCell = screen.getByLabelText("ردیف 1 ستون 7");
    const secondCell = screen.getByLabelText("ردیف 1 ستون 6");

    await user.click(firstCell);
    await user.keyboard("س");

    expect(firstCell).toHaveTextContent("س");
    expect(secondCell).toHaveClass("cell-selected");
  });

  it("auto-opens the tutorial on first run and persists dismissal", async () => {
    const user = userEvent.setup();
    window.localStorage.removeItem("persian-crossword-seen-tutorial");

    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    const dialog = screen.getByRole("dialog", { name: "راهنمای استفاده" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("افقی")).toBeInTheDocument();
    expect(within(dialog).getByText("عمودی")).toBeInTheDocument();
    expect(within(dialog).getByText("سرحد")).toBeInTheDocument();
    expect(within(dialog).getByText("والده")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("button", { name: /مرحله/ })).toHaveLength(4);
    expect(within(dialog).queryByText("راهنمای صفحه‌کلید")).not.toBeInTheDocument();
    expect(dialog.querySelectorAll(".tutorial-stage .cell-value svg").length).toBeGreaterThan(0);

    await user.click(within(dialog).getByRole("button", { name: "فهمیدم" }));

    expect(screen.queryByRole("dialog", { name: "راهنمای استفاده" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("persian-crossword-seen-tutorial")).toBe("true");
  });

  it("does not auto-open the tutorial when already seen, but opens from the toolbar", async () => {
    const user = userEvent.setup();

    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    expect(screen.queryByRole("dialog", { name: "راهنمای استفاده" })).not.toBeInTheDocument();

    const menuButton = screen.getByRole("button", { name: "منوی تنظیمات" });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await user.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: "راهنمای استفاده" }));

    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("dialog", { name: "راهنمای استفاده" })).toBeInTheDocument();
  });

  it("restores localStorage progress for the given id", () => {
    window.localStorage.setItem(
      "persian-crossword:sample-10x10-garden",
      JSON.stringify({ cells: { "0,9": "س" } }),
    );

    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    expect(screen.getByLabelText("ردیف 1 ستون 10")).toHaveTextContent("س");
  });

  it("preserves the selected cell when cloud sync refreshes progress", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SolverPage id="sample-10x10-garden" json={json10} />);

    await user.click(screen.getByLabelText("ردیف 1 ستون 7"));
    expect(screen.getByLabelText("ردیف 1 ستون 7")).toHaveClass("cell-selected");

    window.localStorage.setItem(
      "persian-crossword:sample-10x10-garden",
      JSON.stringify({ cells: { "0,9": "س" } }),
    );
    authState.syncVersion = 1;
    rerender(<SolverPage id="sample-10x10-garden" json={json10} />);

    await waitFor(() => {
      expect(screen.getByLabelText("ردیف 1 ستون 10")).toHaveTextContent("س");
    });
    expect(screen.getByLabelText("ردیف 1 ستون 7")).toHaveClass("cell-selected");
  });
});

