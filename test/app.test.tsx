// @vitest-environment jsdom

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SolverPage } from "../app/pages/SolverPage";
import sample10 from "../samples/sample-10x10-garden.json";
import sample11 from "../samples/sample-11x11-city.json";
import type { CrosswordJson } from "../src/index";

const json10 = sample10 as CrosswordJson;
const json11 = sample11 as CrosswordJson;
let mobileMediaMatches = true;
const mobileMediaListeners = new Set<(event: MediaQueryListEvent) => void>();

function setMobileViewport(matches: boolean): void {
  mobileMediaMatches = matches;
  const event = { matches, media: "(max-width: 860px)" } as MediaQueryListEvent;
  for (const listener of mobileMediaListeners) {
    listener(event);
  }
}

describe("Persian crossword UI", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.location.hash = "";
    mobileMediaMatches = true;
    mobileMediaListeners.clear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(max-width: 860px)" ? mobileMediaMatches : false,
        media: query,
        onchange: null,
        addEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => {
          if (type === "change" && query === "(max-width: 860px)") {
            mobileMediaListeners.add(listener);
          }
        },
        removeEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => {
          if (type === "change" && query === "(max-width: 860px)") {
            mobileMediaListeners.delete(listener);
          }
        },
        addListener: (listener: (event: MediaQueryListEvent) => void) => {
          if (query === "(max-width: 860px)") {
            mobileMediaListeners.add(listener);
          }
        },
        removeListener: (listener: (event: MediaQueryListEvent) => void) => {
          if (query === "(max-width: 860px)") {
            mobileMediaListeners.delete(listener);
          }
        },
        dispatchEvent: () => true,
      })),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("restores localStorage progress for the given id", () => {
    window.localStorage.setItem(
      "persian-crossword:sample-10x10-garden",
      JSON.stringify({ cells: { "0,9": "س" } }),
    );

    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    expect(screen.getByLabelText("ردیف 1 ستون 10")).toHaveTextContent("س");
  });

  it("shows a transient clue-only overlay for the active selection", () => {
    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    const overlay = screen.getByTestId("active-clue-overlay");
    expect(overlay).toHaveTextContent("نمونه افقی 1، 2 حرف");
    expect(overlay.childElementCount).toBe(0);
    expect(overlay).toHaveClass("active-clue-overlay");
    expect(overlay).toHaveStyle({ position: "fixed", pointerEvents: "none" });
    expect(within(screen.getByLabelText("پرسش فعال")).getByText("نمونه افقی 1، 2 حرف")).toBeInTheDocument();
  });

  it("does not show the transient overlay on desktop-sized viewports", () => {
    setMobileViewport(false);
    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    expect(screen.queryByTestId("active-clue-overlay")).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("پرسش فعال")).getByText("نمونه افقی 1، 2 حرف")).toBeInTheDocument();
  });

  it("restarts the overlay timer when the selection changes", () => {
    vi.useFakeTimers();
    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.getByTestId("active-clue-overlay")).toBeInTheDocument();

    const board = screen.getByRole("grid", { name: "جدول کلمات" });
    board.focus();
    fireEvent.keyDown(board, { key: "ArrowLeft" });

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.getByTestId("active-clue-overlay")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByTestId("active-clue-overlay")).not.toBeInTheDocument();
  });

  it("hides the overlay automatically after 3 seconds", () => {
    vi.useFakeTimers();
    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByTestId("active-clue-overlay")).not.toBeInTheDocument();
  });
});

