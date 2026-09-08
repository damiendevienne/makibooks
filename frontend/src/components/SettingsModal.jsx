import React, { useEffect, useState } from "react";
import { Bell, Globe2, LogOut, Mail, Pencil, UserRound } from "lucide-react";
import api from "../api";
import packageJson from "../../package.json";
import { disablePushNotifications, enablePushNotifications, pushNotificationsAvailable } from "../pushNotifications";
import { FilterMenu } from "./FilterPanel";

export default function SettingsModal({ show, onClose, isLoggedIn, user, onLoginToggle, activeZone, zones = [], onZoneChange }) {
  const [language, setLanguage] = useState(() => localStorage.getItem("preferredLanguage") || "en");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [profile, setProfile] = useState({ username: user?.username || "", email: user?.email || "", firstName: user?.firstName || "", lastName: user?.lastName || "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");
  const [profileEditing, setProfileEditing] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => localStorage.getItem("pushNotificationsEnabled") === "true");
  const [notificationStatus, setNotificationStatus] = useState("");
  const [notificationsUpdating, setNotificationsUpdating] = useState(false);

  useEffect(() => {
    setProfile({ username: user?.username || "", email: user?.email || "", firstName: user?.firstName || "", lastName: user?.lastName || "" });
  }, [user?.id]);

  if (!show) return null;

  const updateLanguage = (event) => {
    const nextLanguage = event.target.value;
    setLanguage(nextLanguage);
    localStorage.setItem("preferredLanguage", nextLanguage);
  };
  const zoneOptions = zones.map((zone) => ({
    value: zone.slug,
    label: `${zone.countryCode === "FR" ? "🇫🇷" : zone.countryCode === "GR" ? "🇬🇷" : "🌍"} ${zone.name}${zone.enabled === false ? " · Coming soon" : ""}`,
    disabled: zone.enabled === false,
  }));
  const languageOptions = [
    { value: "en", label: "English" },
    { value: "fr", label: "Français · Coming soon", disabled: true },
    { value: "el", label: "Ελληνικά · Coming soon", disabled: true },
  ];
  const updateProfile = async (event) => {
    event.preventDefault();
    if (profileSaving) return;
    setProfileSaving(true); setProfileStatus("");
    try {
      const response = await api.put("/api/profile", { data: profile });
      const updated = response.data.data;
      localStorage.setItem("user", JSON.stringify(updated));
      setProfileEditing(false); setEditingField(null);
      setProfileStatus(response.data.emailConfirmationRequired ? "Your email was changed. Please confirm the new address before logging in again." : "Profile updated.");
    } catch (error) {
      setProfileStatus(error.response?.data?.error?.message || "Unable to update your profile.");
    } finally { setProfileSaving(false); }
  };
  const sendFeedback = async (event) => {
    event.preventDefault();
    if (!feedback.trim() || feedbackSending) return;
    setFeedbackSending(true); setFeedbackStatus("");
    try {
      await api.post("/api/feedback", { message: feedback.trim() });
      setFeedback(""); setFeedbackOpen(false); setFeedbackStatus("Thanks — your message has been sent.");
    } catch (error) {
      setFeedbackStatus(error.response?.data?.error?.message || "Unable to send your message. Please try again.");
    } finally { setFeedbackSending(false); }
  };
  const toggleNotifications = async () => {
    if (notificationsUpdating) return;
    setNotificationsUpdating(true);
    setNotificationStatus("");
    try {
      if (notificationsEnabled) {
        await disablePushNotifications();
        setNotificationsEnabled(false);
      } else {
        await enablePushNotifications();
        setNotificationsEnabled(true);
      }
    } catch (error) {
      setNotificationStatus(error.message || "Unable to update notification settings.");
    } finally {
      setNotificationsUpdating(false);
    }
  };

  return (
    <div className="modal fade show settings-modal" style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered modal-sm" onClick={(event) => event.stopPropagation()}>
        <div className="modal-content settings-modal-content">
          {notificationsUpdating && <div className="notification-loading-overlay" role="status" aria-live="polite"><div className="spinner-border text-primary" aria-hidden="true" /><span>Updating notifications…</span></div>}
          <div className="modal-header">
            <h5 className="modal-title">Settings</h5>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close settings" />
          </div>
          <div className="modal-body">
            <div className="settings-app-identity" aria-label={`${packageJson.appName} version ${packageJson.version}`}>
              <div className="settings-app-name">{packageJson.appName}</div>
              <div className="settings-app-version">v{packageJson.version}</div>
            </div>
            <div className="settings-account settings-field">
              <div className="settings-account-title"><UserRound size={17} /> Account</div>
              {isLoggedIn ? (
                <>
                  {!editingField && <><div className="d-flex align-items-center justify-content-between"><span>Signed in as <strong>{profile.username || "User"}</strong></span><button type="button" className="btn btn-link btn-sm p-1" aria-label="Edit username" onClick={() => { setEditingField("username"); setProfileStatus(""); }}><Pencil size={15} /></button></div>{profile.email && <div className="d-flex align-items-center justify-content-between text-muted small"><span>{profile.email}</span><button type="button" className="btn btn-link btn-sm p-1" aria-label="Edit email" onClick={() => { setEditingField("email"); setProfileStatus(""); }}><Pencil size={15} /></button></div>}</>}
                  {profileStatus && <div className="text-muted small mt-2" role="status">{profileStatus}</div>}
                  <button type="button" className="btn btn-outline-danger btn-sm mt-2" onClick={() => { onClose(); onLoginToggle?.(); }}><LogOut size={15} /> Log out</button>
                </>
              ) : (
                <>
                  <div className="text-muted small">You are not logged in.</div>
                  <button type="button" className="btn btn-primary btn-sm mt-2" onClick={() => { onClose(); onLoginToggle?.(); }}>Log in</button>
                </>
              )}
            </div>
            <div className="settings-field">
              <label htmlFor="settings-zone">📍 Sharing area</label>
              <FilterMenu label="Sharing area" value={activeZone || ""} options={zoneOptions} onChange={(value) => onZoneChange?.(value)} />
              <small className="text-muted">Only books listed in this area are shown.</small>
            </div>

            <div className="settings-field">
              <label htmlFor="settings-language"><Globe2 size={17} /> Interface language</label>
              <FilterMenu label="Interface language" value={language} options={languageOptions} onChange={(value) => updateLanguage({ target: { value } })} />
              <small className="text-muted">Your preference is saved for this device.</small>
            </div>

            {isLoggedIn && <div className="settings-field">
              <div className="settings-account-title"><Mail size={17} /> Feedback</div>
              <p className="text-muted small mb-2">Maki Books is under continuous development. If you spot a bug, a problematic behaviour or book, or have an idea for improvement, send us a message.</p>
              <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => { setFeedbackOpen((current) => !current); setFeedbackStatus(""); }}>{feedbackOpen ? "Cancel" : "Report a problem or suggest an improvement"}</button>
              {feedbackOpen && <form className="mt-2" onSubmit={sendFeedback}><textarea className="form-control mb-2" rows="4" maxLength="3000" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Tell us what happened or what you would like to suggest…" required /><button type="submit" className="btn btn-primary btn-sm" disabled={feedbackSending || !feedback.trim()}>{feedbackSending ? "Sending…" : "Send message"}</button></form>}
              {feedbackStatus && <div className="text-muted small mt-2" role="status">{feedbackStatus}</div>}
            </div>
            }
            {isLoggedIn && pushNotificationsAvailable() && <div className="settings-field">
              <div className="availability-toggle-row settings-notification-toggle">
                <strong><Bell size={17} aria-hidden="true" /> Allow notifications</strong>
                <div className="form-check form-switch"><input className="form-check-input" type="checkbox" role="switch" checked={notificationsEnabled} onChange={toggleNotifications} disabled={notificationsUpdating} id="settings-notifications" aria-label="Allow notifications" /></div>
              </div>
              <p className="text-muted small mb-2">Get a notification when you receive a new message, even when Maki Books is closed.</p>
              {notificationStatus && <div className="text-muted small mt-2" role="status">{notificationStatus}</div>}
            </div>}
          </div>
        </div>
      </div>
      {editingField && <div className="modal fade show" style={{ display: "block", backgroundColor: "rgba(0,0,0,0.35)", zIndex: 1060 }} onClick={() => { setEditingField(null); setProfileStatus(""); }}>
        <div className="modal-dialog modal-dialog-centered modal-sm" onClick={(event) => event.stopPropagation()}>
          <form className="modal-content" onSubmit={updateProfile}>
            <div className="modal-header"><h5 className="modal-title">Change my {editingField === "email" ? "email" : "username"}</h5><button type="button" className="btn-close" onClick={() => setEditingField(null)} aria-label="Cancel" /></div>
            <div className="modal-body"><p className="text-muted small">{editingField === "email" ? "We’ll send a verification email to your new address. Your current email will remain active until the new one is confirmed." : "Your new username will be associated with all the books you share."}</p><label className="form-label" htmlFor="profile-edit-field">{editingField === "email" ? "New email" : "New username"}</label><input id="profile-edit-field" className="form-control" type={editingField === "email" ? "email" : "text"} value={profile[editingField]} onChange={(event) => setProfile({ ...profile, [editingField]: event.target.value })} required /></div>
            <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setEditingField(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={profileSaving}>{profileSaving ? "Saving…" : `Change ${editingField === "email" ? "email" : "username"}`}</button></div>
          </form>
        </div>
      </div>}
    </div>
  );
}
