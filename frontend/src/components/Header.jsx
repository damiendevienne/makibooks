import React from "react";
import { MapPin, Settings, UserRound } from "lucide-react";
import SettingsModal from "./SettingsModal";

export default function Header({ isLoggedIn, user, onLoginToggle, activeZone, zones, onZoneChange, welcomeMessage, onDismissWelcome }) {
  const [showSettings, setShowSettings] = React.useState(false);
  const [showRealisticLogo, setShowRealisticLogo] = React.useState(false);

  React.useEffect(() => {
    const openSettings = () => setShowSettings(true);
    window.addEventListener("maki-open-settings", openSettings);
    return () => window.removeEventListener("maki-open-settings", openSettings);
  }, []);

  return (
    <header className="bg-white shadow-sm py-3 site-header">
      {welcomeMessage && (
        <div className="welcome-banner" role="status">
          <span>{welcomeMessage}</span>
          <button type="button" className="welcome-banner-close" aria-label="Dismiss" onClick={onDismissWelcome}>×</button>
        </div>
      )}
      <div className="container text-center">
        <button type="button" className="zone-location-trigger" onClick={() => setShowSettings(true)} aria-label={`Sharing area: ${activeZone || "not selected"}`} title="Open sharing area settings">
          <MapPin size={16} strokeWidth={2} aria-hidden="true" /><span>{zones?.find((zone) => zone.slug === activeZone)?.name || activeZone || "Sharing area"}</span>
        </button>
        <button
          type="button"
          className={`settings-trigger ${isLoggedIn ? "is-logged-in" : "is-logged-out"}`}
          onClick={() => setShowSettings(true)}
          aria-label="Open settings"
          title={isLoggedIn ? `Logged in as ${user?.username || "user"}. Open settings` : "Not logged in. Open settings"}
        >
          <span className="account-settings-icons" aria-hidden="true">
            <span className="account-icon-circle account-user-circle"><UserRound className="account-user-icon" size={21} /></span>
            <span className="account-icon-circle account-settings-circle"><Settings className="account-settings-icon" size={21} /></span>
          </span>
          {isLoggedIn && <span className="account-username">{user?.username || "Account"}</span>}
        </button>
        <div className="text-center my-4 logo-stage">
          <button
            type="button"
            className="logo-flip"
            onClick={() => setShowRealisticLogo((current) => !current)}
            aria-label="Flip between Maki Books logos"
            aria-pressed={showRealisticLogo}
          >
            <span className={`logo-flip-inner ${showRealisticLogo ? "is-flipped" : ""}`}>
              <img className="logo-flip-face logo-flip-front" src="/images/maki-recto.png" alt="Maki Books logo" />
              <img className="logo-flip-face logo-flip-back" src="/images/maki-verso.png" alt="Maki Books logo seen from behind" />
            </span>
          </button>
          <div className="logo-tagline">
            <span>Borrow and share physical books</span>
            <span>with people around you</span>
          </div>
        </div>
      </div>
      <SettingsModal
        show={showSettings}
        onClose={() => setShowSettings(false)}
        isLoggedIn={isLoggedIn}
        user={user}
        onLoginToggle={onLoginToggle}
        activeZone={activeZone}
        zones={zones}
        onZoneChange={onZoneChange}
      />
    </header>
  );
}
