// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { SolverPage } from "../app/pages/SolverPage";
import sample10 from "../samples/sample-10x10-garden.json";
import sample11 from "../samples/sample-11x11-city.json";
import type { CrosswordJson } from "../src/index";

const json10 = sample10 as CrosswordJson;
const json11 = sample11 as CrosswordJson;

describe("Persian crossword UI", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Prevent the first-run tutorial from auto-opening in unrelated tests.
    window.localStorage.setItem("persian-crossword-seen-tutorial", "true");
    window.location.hash = "";
  });

  it("renders the puzzle title and active clue", () => {
    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    expect(screen.getByRole("heading", { name: /باغ.*۱۰ در ۱۰|sample-10x10-garden/i })).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(100);
    expect(within(screen.getByLabelText("پرسش فعال")).getByText("نمونه افقی 1، 2 حرف")).toBeInTheDocument();
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

    await user.click(within(dialog).getByRole("button", { name: "فهمیدم" }));

    expect(screen.queryByRole("dialog", { name: "راهنمای استفاده" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("persian-crossword-seen-tutorial")).toBe("true");
  });

  it("does not auto-open the tutorial when already seen, but opens from the toolbar", async () => {
    const user = userEvent.setup();

    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    expect(screen.queryByRole("dialog", { name: "راهنمای استفاده" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "راهنمای استفاده" }));

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
});

