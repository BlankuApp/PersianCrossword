// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const fakeAuth = vi.hoisted(() => ({
  currentUser: null as null | { uid: string },
  authStateReady: async () => {},
}));
const authCtx = vi.hoisted(() => ({ user: null as null | { uid: string; isAnonymous: boolean } }));
const mocks = vi.hoisted(() => ({
  streamGemini: vi.fn(),
  streamFreeAi: vi.fn(),
  signInAnonymously: vi.fn(),
}));

vi.mock("../app/firebase", () => ({ auth: fakeAuth, functions: {} }));
vi.mock("../app/AuthContext", () => ({ useAuth: () => authCtx }));
vi.mock("firebase/auth", () => ({ signInAnonymously: mocks.signInAnonymously }));
vi.mock("../app/components/AuthButton", () => ({
  AuthButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));
vi.mock("../app/gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/gemini")>();
  return { ...actual, streamGemini: mocks.streamGemini, streamFreeAi: mocks.streamFreeAi };
});

import { QuotaError } from "../app/gemini";
import { ClueAiButton } from "../app/components/ClueAiDialog";
import { ActiveClue } from "../app/components/CluePanel";
import type { Slot } from "../src/types";

const button = () => <ClueAiButton clue="پایتخت ایران" isSolved={false} cellValues={[undefined, undefined, undefined, undefined]} answer="تهران" />;

function renderButton() {
  const { rerender } = render(button());
  return Object.assign(userEvent.setup(), { rerender: () => rerender(button()) });
}

describe("ClueAiButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    fakeAuth.currentUser = null;
    fakeAuth.authStateReady = async () => {};
    authCtx.user = null;
    mocks.signInAnonymously.mockImplementation(async () => {
      fakeAuth.currentUser = { uid: "anon" };
    });
    mocks.streamFreeAi.mockImplementation(async (_p: string, onChunk: (t: string) => void) => onChunk("تهران"));
    mocks.streamGemini.mockImplementation(async (_p: string, _k: string, onChunk: (t: string) => void) => onChunk("تهران"));
  });

  it("uses own key directly", async () => {
    localStorage.setItem("persian-crossword-gemini-key", "my-key");
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    expect(await screen.findByText("تهران")).toBeInTheDocument();
    expect(mocks.streamGemini).toHaveBeenCalledOnce();
    expect(mocks.streamGemini.mock.calls[0]?.[1]).toBe("my-key");
    expect(mocks.streamFreeAi).not.toHaveBeenCalled();
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in anonymously then uses the free tier when signed out", async () => {
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    expect(await screen.findByText("تهران")).toBeInTheDocument();
    expect(mocks.signInAnonymously).toHaveBeenCalledOnce();
    expect(mocks.streamFreeAi).toHaveBeenCalledOnce();
  });

  it("does not sign in again when already signed in", async () => {
    fakeAuth.currentUser = { uid: "u1" };
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    await screen.findByText("تهران");
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
  });

  it("shows the guest quota message with sign-up and key form", async () => {
    mocks.streamFreeAi.mockRejectedValue(new QuotaError({ reason: "user", tier: "guest", limit: 10 }));
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    expect(await screen.findByText(/سهمیهٔ رایگان امروز شما \(۱۰ پرسش\) تمام شد/)).toBeInTheDocument();
    expect(screen.getByText(/روزانه ۱۰۰ پرسش رایگان دارید/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ساخت حساب" })).toBeInTheDocument();
    expect(screen.getByLabelText("کلید هوشواره (Gemini)")).toBeInTheDocument();
  });

  it("shows the account quota message without sign-up", async () => {
    mocks.streamFreeAi.mockRejectedValue(new QuotaError({ reason: "user", tier: "account", limit: 100 }));
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    expect(await screen.findByText(/\(۱۰۰ پرسش\) تمام شد/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ساخت حساب" })).not.toBeInTheDocument();
  });

  it("shows the shared quota message", async () => {
    mocks.streamFreeAi.mockRejectedValue(new QuotaError({ reason: "shared" }));
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    expect(await screen.findByText(/برای همهٔ کاربران تمام شده/)).toBeInTheDocument();
  });

  it("uses a key entered in the quota form", async () => {
    mocks.streamFreeAi.mockRejectedValue(new QuotaError({ reason: "shared" }));
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    await user.type(await screen.findByLabelText("کلید هوشواره (Gemini)"), "typed-key");
    await user.click(screen.getByRole("button", { name: "ذخیره و دریافت پاسخ" }));
    expect(await screen.findByText("تهران")).toBeInTheDocument();
    expect(mocks.streamGemini.mock.calls[0]?.[1]).toBe("typed-key");
    expect(localStorage.getItem("persian-crossword-gemini-key")).toBe("typed-key");
  });

  it("reopening after a guest upgrades asks again", async () => {
    mocks.streamFreeAi.mockRejectedValueOnce(new QuotaError({ reason: "user", tier: "guest", limit: 10 }));
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    await screen.findByText(/\(۱۰ پرسش\) تمام شد/);

    // Guest signs up via the modal (AuthButton is mocked here); the app now has a full account.
    fakeAuth.currentUser = { uid: "u1" };
    await user.click(screen.getByRole("button", { name: "بستن" }));
    await user.click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    expect(await screen.findByText("تهران")).toBeInTheDocument();
  });

  it("waits for the saved session before deciding to sign in anonymously", async () => {
    fakeAuth.authStateReady = async () => {
      fakeAuth.currentUser = { uid: "u1" };
    };
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    await screen.findByText("تهران");
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
  });

  it("retries by itself once a guest signs up from the quota message", async () => {
    mocks.streamFreeAi.mockRejectedValueOnce(new QuotaError({ reason: "user", tier: "guest", limit: 10 }));
    authCtx.user = { uid: "anon", isAnonymous: true };
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    await screen.findByText(/\(۱۰ پرسش\) تمام شد/);

    authCtx.user = { uid: "u1", isAnonymous: false };
    fakeAuth.currentUser = { uid: "u1" };
    user.rerender();
    expect(await screen.findByText("تهران")).toBeInTheDocument();
    expect(mocks.streamFreeAi).toHaveBeenCalledTimes(2);
  });
});

describe("ActiveClue AI letters", () => {
  const slot = {
    id: "C1-1",
    direction: "down",
    groupNum: 1,
    clue: "پیچ و خم زلف",
    cells: [0, 1, 2].map((row) => ({ row, col: 0 })),
  } as unknown as Slot;
  const solution = ["ش", "ک", "ن"];

  function renderClue(values: (string | undefined)[], withSolution = true) {
    render(
      <ActiveClue
        slots={{ down: slot }}
        activeDirection="down"
        getCellValue={(c) => values[c.row]}
        getSolutionValue={(c) => (withSolution ? solution[c.row] : undefined)}
      />,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("persian-crossword-gemini-key", "k");
  });

  it("explains only when the word is filled in correctly", () => {
    renderClue(["ش", "ک", "ن"]);
    expect(screen.getByRole("button", { name: /توضیح با هوشواره/ })).toBeInTheDocument();
  });

  it("stays in ask mode and hides wrong letters when the word is filled in wrongly", async () => {
    renderClue(["ش", "ک", "ه"]);
    await userEvent.setup().click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    expect(mocks.streamGemini.mock.calls[0]?.[0]).toContain("حرف ۱: ش، حرف ۲: ک، حرف ۳: ؟");
  });

  it("explains the player's letters when the puzzle has no solution", async () => {
    renderClue(["ش", "ک", "ن"], false);
    await userEvent.setup().click(screen.getByRole("button", { name: /توضیح با هوشواره/ }));
    expect(mocks.streamGemini.mock.calls[0]?.[0]).toContain("پاسخ: «شکن»");
  });
});
