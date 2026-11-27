"use client";

import { useEffect, useRef, useState } from "react";
import { translateText, useLanguage } from "@/components/language-provider";
import { issueRecoveryPin, loadRecoveryRequests, type RecoveryRequest } from "@/supabase/password-recovery-api";

export default function PasswordRecoveryRequests() {
  const { language } = useLanguage();
  const t = (text: string) => translateText(text, language);
  const [requests, setRequests] = useState<RecoveryRequest[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ requestId: string; pin: string; expiresAt: number } | null>(null);
  const [selected, setSelected] = useState<RecoveryRequest | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (selected) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [selected]);

  useEffect(() => {
    let active = true;
    void loadRecoveryRequests().then((rows) => {
      if (active) { setRequests(rows); setError(null); }
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Password recovery is unavailable. Contact the administrator.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden && !working && !selected) setRevision((value) => value + 1);
      setIssued((current) => current && current.expiresAt <= Date.now() ? null : current);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [working, selected]);

  async function issue(request: RecoveryRequest) {
    setWorking(request.request_id);
    setError(null);
    setIssued(null);
    try {
      const pin = await issueRecoveryPin(request.request_id);
      setIssued({ requestId: request.request_id, pin, expiresAt: Date.now() + 10 * 60_000 });
      setSelected(null);
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "PIN issuance could not be confirmed. Refresh the list before trying again.");
    } finally { setWorking(null); }
  }

  return (
    <section className="deletion-requests" aria-labelledby="recovery-requests-title">
      <div className="deletion-requests__header">
        <div>
          <span className="eyebrow">OWNER · PIN</span>
          <h3 id="recovery-requests-title">{t("Password recovery requests")} · {requests.length}</h3>
        </div>
        <button className="button button--secondary" disabled={loading || !!working} type="button"
          onClick={() => { setLoading(true); setRevision((value) => value + 1); }}>{t("Refresh")}</button>
      </div>
      <p>{t("Verify the employee's identity before issuing a PIN. Share the code privately, never their new password.")}</p>
      {error && <p className="inline-message" role="alert">{t(error)}</p>}
      {loading && <p role="status">{t("Loading Supabase records…")}</p>}
      {!loading && !error && requests.length === 0 && <p>{t("No pending password recovery requests.")}</p>}
      <div className="deletion-request-list">
        {requests.map((request) => (
          <article className="deletion-request-card" key={request.request_id}>
            <div className="deletion-request-card__summary">
              <strong>{request.display_name}</strong>
              <span>{request.email} · {new Date(request.requested_at).toLocaleString(language === "vi" ? "vi-VN" : "en-US")}</span>
            </div>
            {issued?.requestId === request.request_id ? (
              <div className="recovery-issued-pin" role="status">
                <strong aria-label={t("Four-digit PIN")}>{issued.pin}</strong>
                <span>{t("Single-use PIN. Valid for 10 minutes. It cannot be viewed again after leaving this page.")}</span>
                <button className="login-link" type="button" onClick={() => setIssued(null)}>{t("Hide PIN")}</button>
              </div>
            ) : request.issued ? <span>{t(request.emailed
              ? "PIN sent to the owner's email. Waiting for the employee."
              : "PIN issued. Waiting for the employee.")}</span> : (
              <button className="button button--secondary" disabled={!!working || !!error} type="button"
                onClick={() => setSelected(request)}>{t("Issue PIN")}</button>
            )}
          </article>
        ))}
      </div>
      <dialog className="recovery-dialog" ref={dialogRef} aria-labelledby="issue-pin-title"
        onCancel={(event) => { if (working) event.preventDefault(); }}
        onClose={() => setSelected(null)}>
        {selected && <>
            <h3 id="issue-pin-title">{t("Confirm employee identity")}</h3>
            <p>{selected.display_name} · {selected.email}</p>
            <p>{t("Only issue a PIN after independently confirming who requested it.")}</p>
            <div className="deletion-request-card__actions">
              <button className="button button--secondary" autoFocus disabled={!!working} onClick={() => setSelected(null)} type="button">{t("Cancel")}</button>
              <button className="button button--primary" disabled={!!working} onClick={() => void issue(selected)} type="button">
                {t(working ? "Verifying…" : "Identity verified — issue PIN")}
              </button>
            </div>
            {error && <p className="inline-message" role="alert">{t(error)}</p>}
        </>}
      </dialog>
    </section>
  );
}
