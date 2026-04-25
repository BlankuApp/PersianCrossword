// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../app/App";

describe("Persian crossword UI", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the default sample grid and active clue", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "جدول کلمات فارسی" })).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(100);
    expect(within(screen.getByLabelText("پرسش فعال")).getByText("نمونه افقی 1، 2 حرف")).toBeInTheDocument();
  });

  it("loads another sample from the picker", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByLabelText("انتخاب جدول"), "sample-11x11-city");

    expect(screen.getAllByRole("gridcell")).toHaveLength(121);
  });

  it("toggles direction when clicking an intersecting cell twice", async () => {
    const user = userEvent.setup();
    render(<App />);

    const firstCell = screen.getByLabelText("ردیف 1 ستون 10");
    expect(within(screen.getByLabelText("پرسش فعال")).getByText("نمونه افقی 1، 2 حرف")).toBeInTheDocument();

    await user.click(firstCell);
    expect(within(screen.getByLabelText("پرسش فعال")).getByText("نمونه عمودی 1، 4 حرف")).toBeInTheDocument();
  });

  it("types one Persian character and advances through the active word", async () => {
    const user = userEvent.setup();
    render(<App />);

    const firstCell = screen.getByLabelText("ردیف 1 ستون 7");
    const secondCell = screen.getByLabelText("ردیف 1 ستون 6");

    await user.click(firstCell);
    await user.keyboard("س");

    expect(firstCell).toHaveTextContent("س");
    expect(secondCell).toHaveClass("cell-selected");
  });

  it("restores localStorage progress for the selected sample", () => {
    window.localStorage.setItem(
      "persian-crossword:sample-10x10-garden",
      JSON.stringify({ cells: { "0,9": "س" } }),
    );

    render(<App />);

    expect(screen.getByLabelText("ردیف 1 ستون 10")).toHaveTextContent("س");
  });
});
