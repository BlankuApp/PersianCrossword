import { useEffect, useRef, useState } from "react";
import * as firebaseui from "firebaseui";
import { GoogleAuthProvider, EmailAuthProvider, signInWithCredential } from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import "firebaseui/dist/firebaseui.css";
import { auth } from "../firebase";
import { useAuth } from "../AuthContext";

// Google's OAuth servers block sign-in inside embedded WebViews (signInWithPopup fails
// with "disallowed_useragent"), so native platforms use a native Google Sign-In button
// instead and bridge the resulting ID token into the same firebase/auth instance.
const isNative = Capacitor.isNativePlatform();

export function AuthButton() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const uiRef = useRef<firebaseui.auth.AuthUI | null>(null);

  useEffect(() => {
    if (!open || !containerRef.current) return;

    const ui = firebaseui.auth.AuthUI.getInstance() ?? new firebaseui.auth.AuthUI(auth);
    uiRef.current = ui;

    ui.start(containerRef.current, {
      signInFlow: "popup",
      signInOptions: isNative
        ? [EmailAuthProvider.PROVIDER_ID, firebaseui.auth.AnonymousAuthProvider.PROVIDER_ID]
        : [
            GoogleAuthProvider.PROVIDER_ID,
            EmailAuthProvider.PROVIDER_ID,
            firebaseui.auth.AnonymousAuthProvider.PROVIDER_ID,
          ],
      callbacks: {
        signInSuccessWithAuthResult: () => {
          setOpen(false);
          return false;
        },
      },
    });

    return () => {
      uiRef.current?.reset();
    };
  }, [open]);

  async function signInWithGoogleNative() {
    setGoogleError(null);
    try {
      const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
      const idToken = result.credential?.idToken;
      if (!idToken) throw new Error("توکن ورود دریافت نشد");
      await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
      setOpen(false);
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : "خطا در ورود با گوگل");
    }
  }

  if (user) {
    const label = user.isAnonymous ? "مهمان" : (user.displayName ?? user.email ?? "کاربر");
    return (
      <div className="auth-user">
        <span className="auth-user-name">{label}</span>
        <button type="button" className="auth-btn" onClick={signOut}>
          خروج
        </button>
      </div>
    );
  }

  return (
    <>
      <button type="button" className="auth-btn" onClick={() => setOpen(true)}>
        ورود
      </button>

      {open && (
        <div className="auth-modal-backdrop" onClick={() => setOpen(false)}>
          <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="auth-modal-close"
              onClick={() => setOpen(false)}
              aria-label="بستن"
            >
              ✕
            </button>
            {isNative && (
              <div className="auth-native-google">
                <button type="button" className="auth-btn auth-btn-block" onClick={signInWithGoogleNative}>
                  ورود با گوگل
                </button>
                {googleError && <p className="auth-error">{googleError}</p>}
              </div>
            )}
            <div ref={containerRef} />
          </div>
        </div>
      )}
    </>
  );
}
