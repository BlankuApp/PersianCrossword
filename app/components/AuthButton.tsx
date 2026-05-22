import { useEffect, useRef, useState } from "react";
import * as firebaseui from "firebaseui";
import { GoogleAuthProvider, EmailAuthProvider } from "firebase/auth";
import "firebaseui/dist/firebaseui.css";
import { auth } from "../firebase";
import { useAuth } from "../AuthContext";

export function AuthButton() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const uiRef = useRef<firebaseui.auth.AuthUI | null>(null);

  useEffect(() => {
    if (!open || !containerRef.current) return;

    const ui = firebaseui.auth.AuthUI.getInstance() ?? new firebaseui.auth.AuthUI(auth);
    uiRef.current = ui;

    ui.start(containerRef.current, {
      signInFlow: "popup",
      signInOptions: [
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
            <div ref={containerRef} />
          </div>
        </div>
      )}
    </>
  );
}
