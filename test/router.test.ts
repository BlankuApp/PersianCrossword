// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
const native = vi.hoisted(() => ({ back: (() => {}) as () => void, exit: vi.fn(), remove: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/app", () => ({ App: {
  addListener: async (_event: string, handler: () => void) => { native.back = handler; return { remove: native.remove }; },
  exitApp: native.exit,
} }));
import { parseHash, puzzleHash, useHardwareBackButton, type Route } from "../app/router";

describe("support routes and hardware back", () => {
  beforeEach(() => { vi.clearAllMocks(); window.location.hash = "#/"; });
  it("parses contact, support and encoded support thread links safely", () => {
    expect(parseHash("#/contact")).toEqual({ name: "contact" });
    expect(parseHash("#/support")).toEqual({ name: "support" });
    expect(parseHash("#/support/thread/thread%20%2F%D8%A8")).toEqual({ name: "supportThread", id: "thread /ب" });
    expect(parseHash("#/support/thread/%")).toEqual({ name: "home" });
    expect(parseHash("#/support/thread/")).toEqual({ name: "home" });
  });
  it.each([
    [{ name: "contact" }, "#/"], [{ name: "support" }, "#/"],
    [{ name: "supportThread", id: "t" }, "#/support"],
    [{ name: "puzzle", id: "p", slotId: "across:1" }, "#/"],
    [{ name: "admin" }, "#/"], [{ name: "draft", id: "d" }, "#/admin"],
  ] as const)("handles back from %j", (route, expected) => {
    window.location.hash = "#/current";
    renderHook(() => useHardwareBackButton(route as Route));
    native.back();
    expect(window.location.hash).toBe(expected);
    expect(native.exit).not.toHaveBeenCalled();
  });
  it("uses the current route after navigation and exits only from home", () => {
    const { rerender } = renderHook(({ route }: { route: Route }) => useHardwareBackButton(route), { initialProps: { route: { name: "home" } as Route } });
    native.back();
    expect(native.exit).toHaveBeenCalledOnce();
    rerender({ route: { name: "supportThread", id: "t" } });
    native.back();
    expect(window.location.hash).toBe("#/support");
    expect(native.exit).toHaveBeenCalledOnce();
  });
});

describe("puzzle hash routes", () => {
  it("keeps existing puzzle links valid without a slot", () => {
    expect(parseHash("#/puzzle/123")).toEqual({ name: "puzzle", id: "123" });
    expect(parseHash("#/puzzle/123?slot=")).toEqual({ name: "puzzle", id: "123" });
  });

  it("decodes the optional exact slot including reserved and Persian characters", () => {
    expect(parseHash("#/puzzle/123?slot=down%3A2%2F%D8%A8%20%26%3F%23%2B")).toEqual({
      name: "puzzle", id: "123", slotId: "down:2/ب &?#+",
    });
  });

  it("builds URI-safe puzzle and slot links", () => {
    expect(puzzleHash("جدول/1", "down:2/ب &?#+")).toBe("#/puzzle/%D8%AC%D8%AF%D9%88%D9%84%2F1?slot=down%3A2%2F%D8%A8%20%26%3F%23%2B");
    expect(parseHash(puzzleHash("جدول/1", "down:2/ب &?#+"))).toEqual({ name: "puzzle", id: "جدول/1", slotId: "down:2/ب &?#+" });
    expect(puzzleHash("123")).toBe("#/puzzle/123");
  });

  it("does not crash on malformed encoded puzzle or slot data", () => {
    expect(() => parseHash("#/puzzle/%?slot=%")).not.toThrow();
    expect(parseHash("#/puzzle/123?slot=%")).toEqual({ name: "puzzle", id: "123", slotId: "%" });
  });

  it("keeps admin support origin only on explicit exact-slot links", () => {
    const link = puzzleHash("جدول/1", "R1-2", "admin-support");
    expect(link).toBe("#/puzzle/%D8%AC%D8%AF%D9%88%D9%84%2F1?slot=R1-2&from=admin-support");
    expect(parseHash(link)).toEqual({ name: "puzzle", id: "جدول/1", slotId: "R1-2", from: "admin-support" });
    expect(parseHash(puzzleHash("جدول/1", "R1-2"))).toEqual({ name: "puzzle", id: "جدول/1", slotId: "R1-2" });
  });

  it("returns an admin support puzzle to the inbox on hardware back", () => {
    window.location.hash = "#/puzzle/p?slot=R1-2&from=admin-support";
    renderHook(() => useHardwareBackButton(parseHash(window.location.hash)));
    native.back();
    expect(window.location.hash).toBe("#/admin?tab=support");
  });
});
