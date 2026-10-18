// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const platform = vi.hoisted(() => ({ native: false }));
vi.mock("@capacitor/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@capacitor/core")>();
  return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => platform.native } };
});
vi.mock("../app/AuthContext", () => ({ useAuth: () => ({ user: null, loading: true, syncVersion: 0 }) }));
vi.mock("../app/components/AuthButton", () => ({ AuthButton: () => null }));
vi.mock("../app/puzzleLibrary", () => ({ listPuzzles: () => [], usePuzzleLibrary: () => ({ puzzles: [], ready: true, sync: "ok" }) }));

import { HomePage } from "../app/pages/HomePage";
import { PLAY_STORE_URL } from "../app/appPromo";
import { WHATS_NEW } from "../app/whatsNew";

const playLinks = () => document.querySelectorAll(`a[href="${PLAY_STORE_URL}"]`);

describe("Android app promo", () => {
  beforeEach(() => {
    localStorage.clear();
    platform.native = false;
  });

  it("shows the card on the web until closed, then keeps only the footer badge", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<HomePage />);
    expect(screen.getByRole("heading", { name: "اپ اندروید منتشر شد" })).toBeTruthy();
    expect(playLinks()).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "بستن پیام اپ اندروید" }));
    expect(screen.queryByRole("heading", { name: "اپ اندروید منتشر شد" })).toBeNull();
    expect(playLinks()).toHaveLength(1);

    unmount();
    render(<HomePage />);
    expect(screen.queryByRole("heading", { name: "اپ اندروید منتشر شد" })).toBeNull();
  });

  it("copies the share message where there is no share sheet", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<HomePage />);
    await user.click(screen.getAllByRole("button", { name: "معرفی به دوستان" })[0]!);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(PLAY_STORE_URL));
    expect(screen.getByText("لینک کپی شد")).toBeTruthy();
  });

  it("hides every Play Store link and web-only news in the Android app", async () => {
    platform.native = true;
    localStorage.setItem("persian-crossword-whats-new-seen", WHATS_NEW[1]!.date);
    const user = userEvent.setup();
    render(<HomePage />);
    expect(playLinks()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "معرفی به دوستان" })).toBeNull();
    expect(document.querySelector(".whats-new-badge")).toBeNull();

    await user.click(screen.getByRole("button", { name: "چه خبر؟" }));
    expect(screen.queryByText(WHATS_NEW[0]!.title)).toBeNull();
  });
});
