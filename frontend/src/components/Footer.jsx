import React, { useCallback, useEffect, useState } from "react";
import { Heart, BookOpen, LogIn, MessageCircle } from "lucide-react";
import MyBooksModal from "./mybooks/MyBooksModal";
import MessagesModal from "./messages/MessagesModal";
import api from "../api";


export default function Footer({ isLoggedIn, user = {}, onLoginToggle, onBookCreated, onBookUpdated, activeZone, activeZoneDocumentId, favoritesCount = 0, favoritesOnly, onToggleFavorites, openConversationId, onConversationOpened }) {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showMyBooks, setShowMyBooks] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [initialConversationId, setInitialConversationId] = useState(null);
  const [myBooksRefreshToken, setMyBooksRefreshToken] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const applyUnreadCount = useCallback((count) => setUnreadMessages(Math.max(0, Number(count) || 0)), []);

  useEffect(() => {
    if (!isLoggedIn || !user?.id) {
      setUnreadMessages(0);
      navigator.clearAppBadge?.();
      return undefined;
    }
    const refreshUnread = () => api.get(`/api/conversations/unread-count?zone=${encodeURIComponent(activeZone || "heraklion")}`)
      .then((res) => {
        const count = Number(res.data.data?.count || 0);
        setUnreadMessages(count);
      })
      .catch(() => {});
    refreshUnread();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshUnread();
    };
    const handleFocus = () => refreshUnread();
    const handlePush = (event) => {
      if (event.data?.type === "bookmybook-push") refreshUnread();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    navigator.serviceWorker?.addEventListener("message", handlePush);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      navigator.serviceWorker?.removeEventListener("message", handlePush);
    };
  }, [isLoggedIn, user?.id, activeZone]);
  useEffect(() => {
    if (isLoggedIn) return;
    setShowMessages(false);
    setShowMyBooks(false);
    setInitialConversationId(null);
    setShowLogoutConfirm(false);
  }, [isLoggedIn]);
  const handleUserClick = () => {
    // If logged in, ask for confirmation before logout
    if (isLoggedIn) {
      setShowLogoutConfirm(true);
    } else {
      onLoginToggle(); // If not logged in, open login modal
    }
  };

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    onLoginToggle(); // trigger logout logic in parent
  };
  const openConversation = (conversationId) => {
    setInitialConversationId(conversationId);
    setShowMessages(true);
  };
  useEffect(() => {
    if (!openConversationId) return;
    openConversation(openConversationId);
    onConversationOpened?.();
  }, [openConversationId]);
  const closeMessages = () => {
    setShowMessages(false);
    setInitialConversationId(null);
  };
  const handleLoanUpdated = (...args) => {
    setMyBooksRefreshToken((value) => value + 1);
    onBookUpdated?.(...args);
  };

  return (
    <>
      <footer
        className="bg-white border-top py-2 position-fixed bottom-0 w-100"
        style={{ zIndex: 1050 }}
      >
        <div className="container d-flex justify-content-around align-items-center">
          {/* Favorites (visible only when logged in) */}
          {isLoggedIn && (
            <button
              className={`btn btn-link d-flex flex-column align-items-center position-relative footer-favorites-button ${favoritesOnly ? "is-active" : ""}`}
              style={{ textDecoration: "none" }}
              onClick={onToggleFavorites}
              aria-pressed={favoritesOnly}
            >
              <Heart size={22} fill={favoritesOnly ? "currentColor" : "none"} />
              <small>Favorites{favoritesCount > 0 ? ` (${favoritesCount > 99 ? "99+" : favoritesCount})` : ""}</small>
            </button>
          )}

          {isLoggedIn && (
            <button
              className="btn btn-link text-secondary d-flex flex-column align-items-center position-relative"
              style={{ textDecoration: "none" }}
              onClick={() => setShowMessages(true)}
            >
              <MessageCircle size={22} color="var(--maki-books-navy)" />
              {unreadMessages > 0 && <span className="position-absolute translate-middle badge rounded-pill bg-danger" style={{ top: "5px", marginLeft: "25px" }}>{unreadMessages > 99 ? "99+" : unreadMessages}</span>}
              <small style={{ color: "var(--maki-books-navy)" }}>Discussions</small>
            </button>
          )}

          {/* My Books (visible only when logged in) */}
          {isLoggedIn && (
            <button
              className="btn btn-link text-secondary d-flex flex-column align-items-center"
              style={{ textDecoration: "none" }}
              onClick={() => setShowMyBooks(true)}
            >
              <BookOpen size={22} color="var(--maki-books-navy)" />
              <small style={{color:"var(--maki-books-navy)"}}>My Books</small>
            </button>
          )}

          {/* Login (logout is available in Settings → Account) */}
          {!isLoggedIn && <button
            className="btn btn-link text-secondary d-flex flex-column align-items-center"
            style={{ textDecoration: "none" }}
            onClick={handleUserClick}
          >
            <LogIn size={22} />
            <small>Login</small>
          </button>}
        </div>
      </footer>

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div
          className="modal fade show"
          style={{
            display: "block",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
          }}
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Confirm Logout</h5>
                <button
                  className="btn-close"
                  onClick={() => setShowLogoutConfirm(false)}
                ></button>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to disconnect?</p>
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowLogoutConfirm(false)}
                >
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* My Books Modal */}
      {showMyBooks && (
        <MyBooksModal
          show={showMyBooks}
          onClose={() => setShowMyBooks(false)}
          user={user} // pass the logged-in user object
          activeZone={activeZone}
          activeZoneDocumentId={activeZoneDocumentId}
          onBookCreated={onBookCreated}
          onBookUpdated={onBookUpdated}
          onOpenConversation={openConversation}
          externalRefreshToken={myBooksRefreshToken}
        />
      )}
      <MessagesModal show={showMessages} initialConversationId={initialConversationId} onContextBack={initialConversationId ? () => setInitialConversationId(null) : undefined} onClose={closeMessages} user={user || {}} activeZone={activeZone} onUnreadCountChange={applyUnreadCount} onBookUpdated={handleLoanUpdated} />
    </>
  );
}
