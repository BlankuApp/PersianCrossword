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
    window.location.hash = "";
  });

  it("renders the puzzle title and active clue", () => {
    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    expect(screen.getByRole("heading", { name: /نمونه ۱۰ در ۱۰|sample-10x10-garden/i })).toBeInTheDocument();
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

  it("restores localStorage progress for the given id", () => {
    window.localStorage.setItem(
      "persian-crossword:sample-10x10-garden",
      JSON.stringify({ cells: { "0,9": "س" } }),
    );

    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    expect(screen.getByLabelText("ردیف 1 ستون 10")).toHaveTextContent("س");
  });
});

