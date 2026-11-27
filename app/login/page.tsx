"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { readPublicSupabaseConfig } from "@/supabase/config";
import {
  getRoleLandingPath,
} from "@/lib/access";
import { loadWorkspaceIdentity } from "@/supabase/workspace-api";
import { isSupabaseRlsReady } from "@/supabase/config";
import { getSafeErrorMessage } from "@/supabase/errors";
import {
  getCurrentSession,
  signInWithPassword,
  signOut as signOutFromSupabase,
  subscribeToAuthChanges,
  updatePassword,
} from "@/supabase/auth-api";
import { RecoveryCooldownError, requestRecoveryPin, verifyRecoveryPin, updatePasswordWithRecoveryPin } from "@/supabase/password-recovery-api";
import { translateText, useLanguage } from "@/components/language-provider";

type LoginView = "sign-in" | "forgot-password" | "verify-pin" | "reset-password";

// Matches the per-account resend cooldown in supabase/password-recovery.sql.
const RESEND_COOLDOWN_SECONDS = 60;
const EMPTY_PIN = ["", "", "", ""];

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function LoginPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const t = (text: string) => translateText(text, language);
  const config = useMemo(() => readPublicSupabaseConfig(), []);
  const rlsReady = useMemo(() => isSupabaseRlsReady(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [view, setView] = useState<LoginView>("sign-in");
  const [challenge, setChallenge] = useState("");
  const [challengeEmail, setChallengeEmail] = useState("");
  const [cooldown, setCooldown] = useState<{ email: string; until: number } | null>(null);
  const [clock, setClock] = useState(0);
  const [resetToken, setResetToken] = useState("");
  const [pin, setPin] = useState(EMPTY_PIN);
  const pinInputs = useRef<(HTMLInputElement | null)[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(() =>
    !config.configured
      ? config.reason === "invalid"
        ? "Supabase URL is invalid. Use an HTTPS project URL."
        : "Add the Supabase public URL and publishable/anon key to .env.local, then restart the app."
      : rlsReady
        ? null
        : "The Supabase RLS policies are not confirmed. Apply them and set NEXT_PUBLIC_SUPABASE_RLS_READY=true before signing in.",
  );
  const [busy, setBusy] = useState(false);
  const configured = config.configured;
  const cooldownSeconds = cooldown && cooldown.email === normalizeEmail(email)
    ? Math.max(0, Math.ceil((cooldown.until - clock) / 1000))
    : 0;

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setClock(current);
      if (current >= cooldown.until) setCooldown(null);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  function startCooldown(target: string, seconds: number) {
    const current = Date.now();
    setClock(current);
    setCooldown({ email: normalizeEmail(target), until: current + seconds * 1000 });
  }

  const routeUser = useCallback(
    async (userId: string) => {
      if (!rlsReady) {
        setMessage("Apply and verify the database RLS policies before accessing this workspace.");
        return;
      }
      const identity = await loadWorkspaceIdentity(userId);
      if (identity.error) {
        setMessage(identity.error);
        return;
      }
      if (!identity.data?.profile || identity.data.profile.status !== "ACTIVE") {
        await signOutFromSupabase();
        setMessage("This account has no active Drikapex profile. Contact your administrator.");
        return;
      }
      const destination = getRoleLandingPath(identity.data.roles);
      if (!destination) {
        await signOutFromSupabase();
        setMessage("No role is assigned to this account. Contact your administrator.");
        return;
      }
      router.replace(destination);
    },
    [rlsReady, router],
  );

  useEffect(() => {
    if (!config.configured) {
      return;
    }

    let active = true;
    const recoveryRedirect =
      new URLSearchParams(window.location.search).get("mode") === "recovery";

    const unsubscribe = subscribeToAuthChanges((event) => {
      if (event === "PASSWORD_RECOVERY" && active) {
        setResetToken("");
        setView("reset-password");
        setMessage(null);
      }
    });

    if (rlsReady && !recoveryRedirect) {
      void getCurrentSession()
        .then(({ data, error }) => {
          if (!active) return;
          if (error) {
            setMessage(getSafeErrorMessage(error));
            return;
          }
          if (data.session?.user) return routeUser(data.session.user.id);
        })
        .catch((error: unknown) => {
          if (active) setMessage(getSafeErrorMessage(error));
        });
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, [config.configured, rlsReady, routeUser, router]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setBusy(true);

    try {
      const { data, error } = await signInWithPassword(email.trim(), password);
      if (error) {
        setMessage(getSafeErrorMessage(error));
        return;
      }
      if (data.user) {
        await routeUser(data.user.id);
      } else {
        setMessage("Supabase did not return an authenticated user.");
      }
    } catch (error) {
      setMessage(getSafeErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = email.trim();
    setMessage(null);
    setNotice(null);
    setBusy(true);

    try {
      const request = await requestRecoveryPin(target);
      setChallenge(request);
      setChallengeEmail(normalizeEmail(target));
      setPin(EMPTY_PIN);
      setView("verify-pin");
      startCooldown(target, RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      if (error instanceof RecoveryCooldownError) {
        startCooldown(target, error.retryAfter);
        // The rejected request did not invalidate the pending one, so its PIN still works.
        if (challenge && challengeEmail === normalizeEmail(target)) {
          setPin(EMPTY_PIN);
          setView("verify-pin");
          setNotice("A PIN was already requested for this email. Enter it below, or resend when the timer ends.");
          return;
        }
      }
      setMessage(error instanceof Error ? error.message : "Password recovery is unavailable. Contact the administrator.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResendPin() {
    const target = email.trim();
    setMessage(null);
    setNotice(null);
    setBusy(true);
    try {
      const request = await requestRecoveryPin(target);
      setChallenge(request);
      setChallengeEmail(normalizeEmail(target));
      setPin(EMPTY_PIN);
      startCooldown(target, RESEND_COOLDOWN_SECONDS);
      setNotice("A new PIN has been sent to the owner. Earlier PINs no longer work.");
    } catch (error) {
      if (error instanceof RecoveryCooldownError) startCooldown(target, error.retryAfter);
      setMessage(error instanceof Error ? error.message : "Password recovery is unavailable. Contact the administrator.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = pin.join("");
    if (!/^\d{4}$/.test(code)) {
      setMessage("Enter the four-digit PIN.");
      return;
    }
    setBusy(true);
    setMessage(null);
    setNotice(null);
    try {
      const token = await verifyRecoveryPin(challenge, code);
      setChallenge("");
      setChallengeEmail("");
      setPin(EMPTY_PIN);
      setResetToken(token);
      setPassword("");
      setConfirmPassword("");
      setView("reset-password");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password recovery is unavailable. Contact the administrator.");
    } finally { setBusy(false); }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (password.length < 8) {
      setMessage("Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      if (resetToken) {
        await updatePasswordWithRecoveryPin(resetToken, password);
        setResetToken("");
      } else {
        const { data, error } = await updatePassword(password);
        if (error) { setMessage(getSafeErrorMessage(error)); return; }
        if (!data.user) { setMessage("Supabase did not confirm the password update."); return; }
      }
      let signOutFailed = false;
      try {
        const { error } = await signOutFromSupabase();
        signOutFailed = !!error;
      } catch {
        signOutFailed = true;
      }
      setPassword("");
      setConfirmPassword("");
      setView("sign-in");
      if (signOutFailed) {
        setMessage("Password changed, but the session could not be closed. Sign out before signing in again.");
      } else {
        setMessage(null);
        setNotice("Password updated. Sign in with your new password.");
      }
    } catch (error) {
      setMessage(resetToken && error instanceof Error ? error.message : getSafeErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function showSignIn() {
    // A pending challenge is kept in memory so the user can return to it within the resend cooldown.
    setView("sign-in");
    setPassword("");
    setConfirmPassword("");
    setResetToken("");
    setPin(EMPTY_PIN);
    setNotice(null);
    setMessage(null);
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <Link className="brand brand--login" href="/" aria-label={t("DRIKAPEX INTERNAL")}>
          <Image
            alt=""
            className="brand__symbol"
            height={40}
            priority
            src="/office.png"
            width={40}
          />
          <span className="brand__wordmark">
            DRIKAPEX
              <small>{t("INTERNAL")}</small>
          </span>
        </Link>
        <span className="eyebrow">{t("YOUR DIGITAL HEADQUARTERS")}</span>
        <h1>
          {t(view === "forgot-password"
            ? "Reset your password."
            : view === "verify-pin"
              ? "Enter your PIN."
            : view === "reset-password"
              ? "Choose a new password."
              : "Welcome back.")}
        </h1>
        <p className="login-card__intro">
          {t(view === "forgot-password"
            ? "Enter your work email to request a PIN from the owner."
            : view === "verify-pin"
              ? "If your account is eligible, a PIN has been sent to the owner. Keep this page open and contact the owner for the four-digit code. It is single-use, expires within 30 minutes, and allows at most five attempts."
            : view === "reset-password"
              ? "Set a new password for your Drikapex account."
              : "Sign in with your existing Drikapex account. Your role will open the administration dashboard or the virtual office.")}
        </p>

        {view === "sign-in" && (
          <form className="login-form" onSubmit={handleSignIn}>
              <label htmlFor="email">{t("Work email")}</label>
            <input
              autoComplete="username"
              id="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="staff@drikapex.com"
              required
              type="email"
              value={email}
            />
            <div className="login-form__password-label">
              <label htmlFor="password">{t("Password")}</label>
              <button
                className="login-link"
                onClick={() => {
                  setView("forgot-password");
                  setMessage(null);
                  setNotice(null);
                }}
                type="button"
              >
                {t("Forgot password?")}
              </button>
            </div>
            <div className="login-password-field">
              <input
                autoComplete="current-password"
                id="password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={t(showPassword ? "Hide password" : "Show password")}
                aria-pressed={showPassword}
                className="login-password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                title={t(showPassword ? "Hide password" : "Show password")}
                type="button"
              >
                <PasswordVisibilityIcon visible={showPassword} />
              </button>
            </div>
            {message && (
              <div className="inline-message" role="alert">
                {t(message)}
              </div>
            )}
            {notice && <div className="success-message" role="status">{t(notice)}</div>}
            <button
              className="button button--primary login-form__submit"
              disabled={!configured || !rlsReady || busy}
              type="submit"
            >
              {t(busy ? "Signing in…" : "Sign in")}
            </button>
          </form>
        )}

        {view === "forgot-password" && (
          <form className="login-form" onSubmit={handleRequestReset}>
            <label htmlFor="recovery-email">{t("Work email")}</label>
            <input
              autoComplete="email"
              id="recovery-email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="staff@drikapex.com"
              required
              type="email"
              value={email}
            />
            {message && (
              <div className="inline-message" role="status">
                {t(message)}
              </div>
            )}
            <button
              className="button button--primary login-form__submit"
              disabled={!configured || busy || cooldownSeconds > 0}
              type="submit"
            >
              {busy ? t("Sending…") : cooldownSeconds > 0 ? `${t("Request again in")} ${formatCountdown(cooldownSeconds)}` : t("Request PIN")}
            </button>
            {challenge && challengeEmail === normalizeEmail(email) && (
              <button className="login-link login-link--back" onClick={() => { setMessage(null); setNotice(null); setPin(EMPTY_PIN); setView("verify-pin"); }}
                disabled={busy} type="button">
                {t("I already have a PIN")}
              </button>
            )}
            <button className="login-link login-link--back" onClick={showSignIn} disabled={busy} type="button">
              {t("Back to sign in")}
            </button>
          </form>
        )}

        {view === "verify-pin" && (
          <form className="login-form" onSubmit={handleVerifyPin}>
            <label>{t("Four-digit PIN")}</label>
            <div className="login-pin" role="group" aria-label={t("Four-digit PIN")} onPaste={(event) => {
              const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
              if (!digits) return;
              event.preventDefault();
              const values = Array.from({ length: 4 }, (_, index) => digits[index] ?? "");
              setPin(values);
              pinInputs.current[Math.min(digits.length, 3)]?.focus();
            }}>
              {pin.map((digit, index) => <input key={index} ref={(input) => { pinInputs.current[index] = input; }}
                aria-label={`${t("PIN digit")} ${index + 1}`} autoComplete={index === 0 ? "one-time-code" : "off"}
                inputMode="numeric" maxLength={1} pattern="[0-9]" required type="text" value={digit} disabled={busy}
                onChange={(event) => {
                  const value = event.target.value.replace(/\D/g, "").slice(-1);
                  setPin((current) => current.map((item, position) => position === index ? value : item));
                  if (value && index < 3) pinInputs.current[index + 1]?.focus();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Backspace" && !digit && index > 0) pinInputs.current[index - 1]?.focus();
                }} />)}
            </div>
            {message && <div className="inline-message" role="alert">{t(message)}</div>}
            {notice && <div className="success-message" role="status">{t(notice)}</div>}
            <button className="button button--primary login-form__submit" disabled={!configured || busy} type="submit">{t(busy ? "Verifying…" : "Verify PIN")}</button>
            <div className="login-resend">
              <span>{t("Didn't receive a PIN?")}</span>
              <button className="login-link" onClick={() => void handleResendPin()} disabled={!configured || busy || cooldownSeconds > 0} type="button">
                {cooldownSeconds > 0 ? `${t("Resend PIN in")} ${formatCountdown(cooldownSeconds)}` : t("Resend PIN")}
              </button>
            </div>
            <button className="login-link login-link--back" onClick={showSignIn} disabled={busy} type="button">{t("Back to sign in")}</button>
          </form>
        )}

        {view === "reset-password" && (
          <form className="login-form" onSubmit={handleResetPassword}>
            <label htmlFor="new-password">{t("New password")}</label>
            <div className="login-password-field">
              <input
                autoComplete="new-password"
                id="new-password"
                maxLength={1024}
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={t(showPassword ? "Hide password" : "Show password")}
                aria-pressed={showPassword}
                className="login-password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                title={t(showPassword ? "Hide password" : "Show password")}
                type="button"
              >
                <PasswordVisibilityIcon visible={showPassword} />
              </button>
            </div>
            <label htmlFor="confirm-password">{t("Confirm new password")}</label>
            <div className="login-password-field">
              <input
                autoComplete="new-password"
                id="confirm-password"
                maxLength={1024}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
              />
              <button
                aria-label={t(showConfirmPassword ? "Hide password" : "Show password")}
                aria-pressed={showConfirmPassword}
                className="login-password-toggle"
                onClick={() => setShowConfirmPassword((visible) => !visible)}
                title={t(showConfirmPassword ? "Hide password" : "Show password")}
                type="button"
              >
                <PasswordVisibilityIcon visible={showConfirmPassword} />
              </button>
            </div>
            {message && (
              <div className="inline-message" role="alert">
                {t(message)}
              </div>
            )}
            <button
              className="button button--primary login-form__submit"
              disabled={!configured || busy}
              type="submit"
            >
              {t(busy ? "Updating…" : "Update password")}
            </button>
            {resetToken && <button className="login-link login-link--back" onClick={showSignIn} disabled={busy} type="button">{t("Back to sign in")}</button>}
          </form>
        )}

        <div className="login-contact-note">
          <strong>{t("Need help?")}</strong>
          <span>
            {t("Contact the owner to verify your identity and receive your PIN.")}
          </span>
        </div>

        <div className="login-card__security">
          <span aria-hidden="true">◆</span>
          {t("No public registration. Workspace access is assigned to existing Supabase accounts by role.")}
        </div>
        <Link
          className="button button--secondary login-home-button"
          href="/drikapex-group-website.html"
        >
          {t("Back to homepage")}
        </Link>
      </section>
      <aside className="login-aside" aria-label={t("Workspace introduction")}>
        <div className="login-aside__grid" aria-hidden="true" />
        <span className="login-aside__orb login-aside__orb--one" aria-hidden="true" />
        <span className="login-aside__orb login-aside__orb--two" aria-hidden="true" />
        <span className="eyebrow">{t("DRIKAPEX · INTERNAL HEADQUARTERS")}</span>
        <div className="login-aside__statement">
          <span>{t("SPACE TO")}</span>
          <strong>{t("work well.")}</strong>
          <span>{t("PEOPLE AT THE CENTER.")}</span>
        </div>
        <div className="login-aside__foot">
          <span>{t("VIRTUAL OFFICE")}</span>
          <span>{t("MANAGEMENT")}</span>
          <span>{t("ONE WORKSPACE")}</span>
        </div>
      </aside>
    </main>
  );
}

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="19"
      viewBox="0 0 24 24"
      width="19"
    >
      <path
        d="M2.5 12s3.25-6 9.5-6 9.5 6 9.5 6-3.25 6-9.5 6-9.5-6-9.5-6Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      {visible ? (
        <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.6" />
      ) : (
        <>
          <circle cx="12" cy="12" r="2.2" fill="currentColor" />
          <path d="m4 4 16 16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
        </>
      )}
    </svg>
  );
}
