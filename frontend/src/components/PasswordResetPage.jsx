import React, { useEffect, useState } from "react";
import api from "../api";
import { Eye, EyeOff } from "lucide-react";

export default function PasswordResetPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const code = searchParams.get("code") || "";
  const preview = import.meta.env.DEV && searchParams.get("preview") === "1";
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [checking, setChecking] = useState(true);
  const [validLink, setValidLink] = useState(false);
  const passwordValid = password.length >= 8 && password.length <= 72 && /[A-Za-z]/.test(password) && /\d/.test(password);

  useEffect(() => {
    let active = true;
    if (preview) {
      setValidLink(true);
      setChecking(false);
      return () => { active = false; };
    }
    if (!code) {
      setError("This reset link is invalid or incomplete.");
      setChecking(false);
      return () => { active = false; };
    }
    api.get("/api/auth/reset-password/validate", { params: { code }, skipAuth: true })
      .then(() => { if (active) setValidLink(true); })
      .catch((err) => { if (active) setError((err.response?.data?.error?.message && err.response.data.error.message !== "Not Found") ? err.response.data.error.message : "This reset link is invalid or has expired."); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [code, preview]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!code || !validLink) return setError("This reset link is invalid or has expired.");
    if (!passwordValid) return setError("Password must be at least 8 characters and include letters and numbers.");
    if (password !== passwordConfirmation) return setError("The passwords do not match.");
    setSaving(true);
    try {
      await api.post("/api/auth/reset-password", { code, password, passwordConfirmation }, { skipAuth: true });
      window.location.href = "/?login=1";
    } catch (err) {
      setError(err.response?.data?.error?.message || "This reset link is invalid or has expired.");
    } finally {
      setSaving(false);
    }
  };

  const title = error && !validLink ? "Reset link unavailable" : "Choose a new password";
  const invalidLink = !checking && !validLink && Boolean(error);
  return <main className="container py-5 auth-page"><div className="row justify-content-center"><div className="col-12 col-md-6 col-lg-4"><div className="card shadow-sm text-center"><div className="card-body p-4">{invalidLink ? <><div className="display-6 mb-2">!</div><h1 className="h4">{title}</h1><p className="text-muted">{error}</p><a className="btn btn-primary w-100" href="/?login=1">Go to Maki Books</a></> : <><h1 className="h4 mb-3">{title}</h1>{checking && <div className="text-muted">Checking your reset link…</div>}{message && <div className="alert alert-success">{message}</div>}{!checking && validLink && !message && <form onSubmit={submit} className="text-start"><label className="form-label" htmlFor="new-password">New password</label><div className="password-field password-reset-field mb-1"><input id="new-password" className="form-control" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength="8" required value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="password-visibility-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div><small className={`form-text d-block mb-3 ${passwordValid ? "text-success" : password ? "text-danger" : ""}`}>At least 8 characters, with letters &amp; numbers.</small><label className="form-label" htmlFor="confirm-password">Confirm password</label><div className="password-field password-reset-field mb-1"><input id="confirm-password" className="form-control" type={showConfirmation ? "text" : "password"} autoComplete="new-password" minLength="8" required value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} /><button type="button" className="password-visibility-toggle" onClick={() => setShowConfirmation((current) => !current)} aria-label={showConfirmation ? "Hide password" : "Show password"}>{showConfirmation ? <EyeOff size={17} /> : <Eye size={17} />}</button></div><small className="form-text d-block mb-3">Both passwords must match.</small><button className="btn btn-primary w-100" disabled={saving || !passwordValid}>{saving ? "Saving…" : "Change password"}</button></form>}</>}</div></div></div></div></main>;
}
