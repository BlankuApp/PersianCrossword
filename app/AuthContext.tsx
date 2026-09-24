import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { auth } from "./firebase";
import { claimDevice, isOfflineError, pushDirty, syncProgress } from "./cloudProgress";
import { clearLocalProgress, countUnsent } from "./progress";

export interface SyncStatus {
  // synced: nothing waiting; pending: changes queued for upload; offline/error: the last try failed.
  readonly kind: "synced" | "pending" | "offline" | "error";
  readonly unsent: number;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  // Bumped whenever sync changed letters on this device, so open views reload them.
  syncVersion: number;
  syncStatus: SyncStatus;
  syncNow: () => Promise<void>;
  pushChanges: () => void;
  // Resolves false when the player chose to stay signed in (unsent changes).
  signOut: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  syncVersion: 0,
  syncStatus: { kind: "synced", unsent: 0 },
  syncNow: async () => {},
  pushChanges: () => {},
  signOut: async () => true,
});

const fa = (n: number) => n.toLocaleString("fa-IR");

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncVersion, setSyncVersion] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ kind: "synced", unsent: 0 });
  const userRef = useRef<User | null>(null);

  const run = useCallback(async (task: (uid: string) => Promise<boolean>) => {
    const current = userRef.current;
    if (!current) return;
    let kind: SyncStatus["kind"] = "synced";
    try {
      if (await task(current.uid)) setSyncVersion((v) => v + 1);
    } catch (error) {
      kind = isOfflineError(error) ? "offline" : "error";
    }
    if (userRef.current !== current) return; // signed out meanwhile
    const unsent = countUnsent();
    setSyncStatus({ kind: kind === "synced" && unsent > 0 ? "pending" : kind, unsent });
  }, []);

  const syncNow = useCallback(() => run(syncProgress), [run]);
  const pushChanges = useCallback(() => void run(pushDirty), [run]);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      userRef.current = nextUser;
      if (nextUser) claimDevice(nextUser.uid, nextUser.isAnonymous);
      setUser(nextUser);
      setLoading(false);
      if (nextUser) void syncNow();
    });
  }, [syncNow]);

  // Leaving the app uploads what's queued; coming back (or back online) checks for news.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") pushChanges();
      else void syncNow();
    }
    function onOnline() {
      void syncNow();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [syncNow, pushChanges]);

  async function signOut(): Promise<boolean> {
    const current = userRef.current;
    // A guest's progress stays on the device (the guest account can't be signed back into);
    // a real account's is uploaded first, then removed so the next player starts clean.
    if (current && !current.isAnonymous) {
      // Offline, an upload attempt would only stall the button for its retries.
      if (navigator.onLine) await pushDirty(current.uid).catch(() => false);
      const unsent = countUnsent();
      const message =
        `${fa(unsent)} جدول هنوز در فضای ابری ذخیره نشده است و با خروج، پیشرفت آن‌ها از این دستگاه پاک می‌شود. ` +
        "با این حال خارج می‌شوید؟";
      if (unsent > 0 && !window.confirm(message)) return false;
    }
    await firebaseSignOut(auth);
    if (current && !current.isAnonymous) clearLocalProgress();
    setSyncStatus({ kind: "synced", unsent: 0 });
    setSyncVersion((v) => v + 1);
    return true;
  }

  return (
    <AuthContext.Provider value={{ user, loading, syncVersion, syncStatus, syncNow, pushChanges, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
