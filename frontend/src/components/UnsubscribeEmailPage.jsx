import React, { useEffect, useState } from "react";
import api from "../api";

export default function UnsubscribeEmailPage() {
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const token = params.get("token");
    if (!id || !token) { setStatus("invalid"); return undefined; }
    api.get(`/api/email/unsubscribe?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`, { skipAuth: true })
      .then(() => setStatus("success"))
      .catch(() => setStatus("invalid"));
    return undefined;
  }, []);
  return (
    <main className="container py-5 auth-page">
      <div className="row justify-content-center">
        <div className="col-12 col-md-6 col-lg-4">
          <div className="card shadow-sm text-center">
            <div className="card-body p-4">
              <div className="display-6 mb-2">{status === "success" ? "✓" : status === "invalid" ? "!" : "…"}</div>
              <h1 className="h4">{status === "success" ? "You have been unsubscribed" : status === "invalid" ? "This link is no longer valid" : "Updating your email settings…"}</h1>
              {status === "success" ? <><p className="text-muted">You will no longer receive Maki Books emails.</p><p className="text-muted">You can reactivate emails at any time from the Settings section of the application.</p></> : status === "invalid" ? <p className="text-muted">This unsubscribe link is invalid or has expired. You can change your email preference from Settings.</p> : <p className="text-muted">Please wait a moment.</p>}
              <a className="btn btn-primary w-100" href="/">Go to Maki Books</a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
