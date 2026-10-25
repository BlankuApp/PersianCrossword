import { Capacitor } from "@capacitor/core";
import { FirebaseAppCheck } from "@capacitor-firebase/app-check";
import { CustomProvider, initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { firebaseApp, usingEmulators } from "./firebase";

async function initialize(): Promise<void> {
  const debugToken = import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN;
  if (debugToken && !import.meta.env.DEV && !usingEmulators) {
    throw new Error("App Check debug configuration is only allowed in development or emulator builds.");
  }

  if (Capacitor.isNativePlatform()) {
    // Android uses its native debug secret; register that token separately from the web token.
    await FirebaseAppCheck.initialize({ debugToken: Boolean(debugToken), isTokenAutoRefreshEnabled: true });
    const provider = new CustomProvider({
      getToken: async () => {
        const result = await FirebaseAppCheck.getToken();
        if (result.expireTimeMillis === undefined) throw new Error("Native App Check token is missing its expiry.");
        return { token: result.token, expireTimeMillis: result.expireTimeMillis };
      },
    });
    initializeAppCheck(firebaseApp, { provider, isTokenAutoRefreshEnabled: true });
    return;
  }

  const siteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
  if (!siteKey) throw new Error("App Check requires VITE_RECAPTCHA_ENTERPRISE_SITE_KEY.");
  if (debugToken) {
    (globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }
  initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export const appCheckReady: Promise<void> = initialize();
// Importing the API can precede an action; callers still receive initialization failures when awaiting it.
void appCheckReady.catch(() => {});
