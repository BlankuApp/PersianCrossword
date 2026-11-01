import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  native: false,
  initialize: vi.fn(),
  nativeToken: vi.fn(),
  initializeAppCheck: vi.fn(),
  customOptions: undefined as { getToken: () => Promise<unknown> } | undefined,
}));
vi.mock("../app/firebase", () => ({ firebaseApp: "app", get usingEmulators() { return import.meta.env.VITE_FUNCTIONS_EMULATOR === "1"; } }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => mocks.native } }));
vi.mock("@capacitor-firebase/app-check", () => ({ FirebaseAppCheck: { initialize: mocks.initialize, getToken: mocks.nativeToken } }));
vi.mock("firebase/app-check", () => ({
  initializeAppCheck: mocks.initializeAppCheck,
  ReCaptchaEnterpriseProvider: class { constructor(public siteKey: string) {} },
  CustomProvider: class { constructor(options: { getToken: () => Promise<unknown> }) { mocks.customOptions = options; } },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("DEV", false);
  vi.stubEnv("VITE_FUNCTIONS_EMULATOR", "");
  vi.stubEnv("VITE_RECAPTCHA_ENTERPRISE_SITE_KEY", "site-key");
  vi.stubEnv("VITE_APP_CHECK_DEBUG_TOKEN", "");
  delete (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN;
  mocks.native = false;
  mocks.customOptions = undefined;
  mocks.initialize.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); });

it("initializes web with the configured Enterprise site key and automatic refresh", async () => {
  await (await import("../app/appCheck")).appCheckReady;
  expect(mocks.initializeAppCheck).toHaveBeenCalledWith("app", { provider: { siteKey: "site-key" }, isTokenAutoRefreshEnabled: true });
  expect(mocks.initialize).not.toHaveBeenCalled();
  expect((globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
});

it("fails closed when web attestation has no site key", async () => {
  vi.stubEnv("VITE_RECAPTCHA_ENTERPRISE_SITE_KEY", "");
  await expect((await import("../app/appCheck")).appCheckReady).rejects.toThrow("VITE_RECAPTCHA_ENTERPRISE_SITE_KEY");
  expect(mocks.initializeAppCheck).not.toHaveBeenCalled();
});

it.each(["development", "emulator"])("requires an explicit debug token even in %s", async (mode) => {
  vi.stubEnv("DEV", mode === "development");
  vi.stubEnv("VITE_FUNCTIONS_EMULATOR", mode === "emulator" ? "1" : "");
  await (await import("../app/appCheck")).appCheckReady;
  expect((globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
});

it.each(["development", "emulator"])("enables a configured web debug token only for %s", async (mode) => {
  vi.stubEnv("DEV", mode === "development");
  vi.stubEnv("VITE_FUNCTIONS_EMULATOR", mode === "emulator" ? "1" : "");
  vi.stubEnv("VITE_APP_CHECK_DEBUG_TOKEN", "registered-debug-token");
  await (await import("../app/appCheck")).appCheckReady;
  expect((globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN).toBe("registered-debug-token");
});

it("rejects debug configuration in production", async () => {
  vi.stubEnv("VITE_APP_CHECK_DEBUG_TOKEN", "registered-debug-token");
  await expect((await import("../app/appCheck")).appCheckReady).rejects.toThrow("debug");
  expect(mocks.initializeAppCheck).not.toHaveBeenCalled();
});

it("waits for native initialization and bridges native tokens to Firebase JS", async () => {
  mocks.native = true;
  let resolve!: () => void;
  mocks.initialize.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
  const { appCheckReady } = await import("../app/appCheck");
  expect(mocks.initialize).toHaveBeenCalledWith({ debugToken: false, isTokenAutoRefreshEnabled: true });
  expect(mocks.initializeAppCheck).not.toHaveBeenCalled();
  resolve();
  await appCheckReady;
  expect(mocks.initializeAppCheck).toHaveBeenCalledWith("app", { provider: expect.anything(), isTokenAutoRefreshEnabled: true });
  const token = { token: "native-attestation", expireTimeMillis: 1900000000000 };
  mocks.nativeToken.mockResolvedValue(token);
  await expect(mocks.customOptions!.getToken()).resolves.toEqual(token);
  expect(mocks.nativeToken).toHaveBeenCalledOnce();
});

it("enables native debug only with explicit development configuration", async () => {
  mocks.native = true;
  vi.stubEnv("DEV", true);
  vi.stubEnv("VITE_APP_CHECK_DEBUG_TOKEN", "registered-native-token");
  await (await import("../app/appCheck")).appCheckReady;
  expect(mocks.initialize).toHaveBeenCalledWith({ debugToken: true, isTokenAutoRefreshEnabled: true });
});

it("rejects native tokens without the expiry Firebase JS requires", async () => {
  mocks.native = true;
  await (await import("../app/appCheck")).appCheckReady;
  mocks.nativeToken.mockResolvedValue({ token: "native-attestation" });
  await expect(mocks.customOptions!.getToken()).rejects.toThrow("expiry");
});

it("propagates native initialization failure without installing a JS provider", async () => {
  mocks.native = true;
  mocks.initialize.mockRejectedValue(new Error("Play Integrity unavailable"));
  await expect((await import("../app/appCheck")).appCheckReady).rejects.toThrow("Play Integrity unavailable");
  expect(mocks.initializeAppCheck).not.toHaveBeenCalled();
});
