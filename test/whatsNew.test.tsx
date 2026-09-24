// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../app/AuthContext", () => ({ useAuth: () => ({ user: null, loading: true, syncVersion: 0 }) }));
vi.mock("../app/components/AuthButton", () => ({ AuthButton: () => null }));
vi.mock("../app/puzzleLibrary", () => ({ listPuzzles: () => [], usePuzzleLibrary: () => ({ puzzles: [], ready: true }) }));

import { HomePage } from "../app/pages/HomePage";
import { WHATS_NEW } from "../app/whatsNew";

const SEEN_KEY = "persian-crossword-whats-new-seen";

describe("WhatsNewButton", () => {
  beforeEach(() => localStorage.clear());

  it("badges unseen entries, highlights them once, then remembers they were seen", async () => {
    localStorage.setItem(SEEN_KEY, WHATS_NEW[1]!.date);
    const user = userEvent.setup();
    render(<HomePage />);

    await user.click(screen.getByRole("button", { name: /چه خبر؟ — ۱ خبر تازه/ }));
    expect(screen.getAllByText("تازه")).toHaveLength(1);
    expect(localStorage.getItem(SEEN_KEY)).toBe(WHATS_NEW[0]!.date);

    await user.click(screen.getByRole("button", { name: "بستن" }));
    expect(document.querySelector(".whats-new-badge")).toBeNull();
    await user.click(screen.getByRole("button", { name: "چه خبر؟" }));
    expect(screen.queryByText("تازه")).toBeNull();
  });

  it("shows no badge once everything has been seen", () => {
    localStorage.setItem(SEEN_KEY, WHATS_NEW[0]!.date);
    render(<HomePage />);
    expect(document.querySelector(".whats-new-badge")).toBeNull();
  });
});
