import React, { useEffect, useRef, useState, useMemo } from "react";
import { HeartCrack } from "lucide-react";
import api from "./api";
import Header from "./components/Header";
import BookCard from "./components/BookCard";
import FilterPanel from "./components/FilterPanel";
import BookModal from "./components/BookModal";
import Footer from "./components/Footer";
import LoginModal from "./components/LoginModal";
import SiteFooter from "./components/SiteFooter";
import ZoneChooser from "./components/ZoneChooser";

import "./App.css";

function normalizeBookAvailability(bookEntry) {
  const book = bookEntry.attributes || bookEntry;
  const hasActiveLoan = (book.loans || []).some((loan) => loan.status === "active");
  if (!hasActiveLoan || book.available === false) return bookEntry;
  if (bookEntry.attributes) return { ...bookEntry, attributes: { ...book, available: false } };
  return { ...bookEntry, available: false };
}

function App() {
  const [books, setBooks] = useState([]);
  const [zones, setZones] = useState([]);
  const [activeZone, setActiveZone] = useState(() => {
    const pathZone = window.location.pathname.split("/")[1];
    return pathZone || localStorage.getItem("activeZone") || "heraklion";
  });
  const [showZoneChooser, setShowZoneChooser] = useState(() => !window.location.pathname.split("/")[1] && !localStorage.getItem("activeZone"));
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({ age: "", available: "", language: "", owner: "" });
  const [pendingFilters, setPendingFilters] = useState({ age: "", available: "", language: "", owner: "" });
  const [sortOrder, setSortOrder] = useState("newest");
  const [favoriteBookIds, setFavoriteBookIds] = useState([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [openConversationId, setOpenConversationId] = useState(null);
  //login new const
  const [isLoggedIn, setIsLoggedIn] = useState(
    !!localStorage.getItem("jwt")
  );
  const [showLogin, setShowLogin] = useState(() => new URLSearchParams(window.location.search).get("login") === "1" && !localStorage.getItem("jwt"));
  const [welcomeMessage, setWelcomeMessage] = useState(() => {
    if (!sessionStorage.getItem("makiAuthExpired")) return "";
    sessionStorage.removeItem("makiAuthExpired");
    return "Your session has expired. Please log in again.";
  });
  const [catalogueState, setCatalogueState] = useState("loading");
  const [user, setUser] = useState(
    JSON.parse(localStorage.getItem("user")) || null
  );
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [cataloguePage, setCataloguePage] = useState(1);
  const [catalogueTotal, setCatalogueTotal] = useState(0);
  const [catalogueHasMore, setCatalogueHasMore] = useState(false);
  const [catalogueLoadingMore, setCatalogueLoadingMore] = useState(false);
  const catalogueSentinelRef = useRef(null);

  useEffect(() => {
    if (isLoggedIn) setShowLogin(false);
  }, [isLoggedIn]);

  useEffect(() => {
    const conversationId = new URLSearchParams(window.location.search).get("conversation");
    if (conversationId) setOpenConversationId(conversationId);
  }, []);

  useEffect(() => {
    localStorage.removeItem("preferredTheme");
    document.body.classList.remove("theme-dark");
  }, []);

  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone;
    const previouslyInstalled = localStorage.getItem("makiAppInstalled") === "true";
    const dismissedAt = Number(localStorage.getItem("installPromptDismissedAt") || 0);
    const recentlyDismissed = dismissedAt && Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000;
    const handleInstallable = (event) => {
      event.preventDefault();
      setInstallPromptEvent(event);
      if (!standalone && !previouslyInstalled && !recentlyDismissed) setShowInstallPrompt(true);
    };
    const handleInstalled = () => {
      localStorage.setItem("makiAppInstalled", "true");
      setInstallPromptEvent(null);
      setShowInstallPrompt(false);
    };
    window.addEventListener("beforeinstallprompt", handleInstallable);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallable);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const dismissInstallPrompt = () => {
    localStorage.setItem("installPromptDismissedAt", String(Date.now()));
    setShowInstallPrompt(false);
  };

  const installApp = async () => {
    if (!installPromptEvent) return dismissInstallPrompt();
    await installPromptEvent.prompt();
    localStorage.setItem("makiAppInstalled", "true");
    setInstallPromptEvent(null);
    setShowInstallPrompt(false);
  };

  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone;
    const dismissedAt = Number(localStorage.getItem("notificationPromptDismissedAt") || 0);
    const recentlyDismissed = dismissedAt && Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000;
    setShowNotificationPrompt(Boolean(isLoggedIn && standalone && !localStorage.getItem("pushNotificationsEnabled") && !recentlyDismissed));
  }, [isLoggedIn]);

  const dismissNotificationPrompt = () => {
    localStorage.setItem("notificationPromptDismissedAt", String(Date.now()));
    setShowNotificationPrompt(false);
  };

  const openNotificationSettings = () => {
    setShowNotificationPrompt(false);
    window.dispatchEvent(new Event("maki-open-settings"));
  };

  useEffect(() => {
    if (!isLoggedIn || !user?.id) {
      setFavoriteBookIds([]);
      setFavoritesOnly(false);
      return;
    }
    api.get(`/api/favorites?zone=${encodeURIComponent(activeZone)}`)
      .then((response) => setFavoriteBookIds(response.data.data || []))
      .catch(() => setFavoriteBookIds([]));
  }, [isLoggedIn, user?.id, activeZone]);

  useEffect(() => {
    if (!welcomeMessage) return undefined;
    const timer = window.setTimeout(() => setWelcomeMessage(""), 5000);
    return () => window.clearTimeout(timer);
  }, [welcomeMessage]);

  const handleLoginSuccess = (user) => {
    setIsLoggedIn(true);
    setUser(user);
    setWelcomeMessage(`Welcome, ${user?.username || "reader"}!`);
  };

  const handleLoginToggle = () => {
    if (isLoggedIn) {
      // Logout
      localStorage.removeItem("jwt");
      localStorage.removeItem("user");
      setIsLoggedIn(false);
      setUser(null);
    } else {
      setShowLogin(true);
    }
  };

  const handleFilterByOwner = (ownerUsername) => {
    setFilters((prev) => ({ ...prev, owner: ownerUsername }));
    setShowModal(false); // close modal when user clicks on owner
  };

  const toggleFavorite = async (bookEntry) => {
    if (!isLoggedIn) {
      setWelcomeMessage("Log in to add books to your favorites.");
      return;
    }
    const book = bookEntry?.attributes || bookEntry;
    const identifier = book?.documentId || book?.id;
    if (!identifier) return;
    const favoriteId = String(book.documentId || identifier);
    const wasFavorite = favoriteBookIds.includes(favoriteId);
    setFavoriteBookIds((current) => wasFavorite ? current.filter((id) => id !== favoriteId) : [...current, favoriteId]);
    try {
      await api.post(`/api/books/${encodeURIComponent(identifier)}/favorite`);
      // Reload the area-scoped list so favorites from another sharing area do
      // not inflate the badge or appear in the current catalogue.
      const favoritesResponse = await api.get(`/api/favorites?zone=${encodeURIComponent(activeZone)}`);
      setFavoriteBookIds(favoritesResponse.data.data || []);
    } catch (error) {
      setFavoriteBookIds((current) => wasFavorite
        ? [...new Set([...current, favoriteId])]
        : current.filter((id) => id !== favoriteId));
      setWelcomeMessage(error.response?.data?.error?.message || "Unable to update favorites.");
    }
  };

  const catalogueQuery = new URLSearchParams({ populate: "*", zone: activeZone });
  if (searchTerm.trim()) catalogueQuery.set("search", searchTerm.trim());
  if (filters.age) catalogueQuery.set("age", filters.age);
  if (filters.language) catalogueQuery.set("language", filters.language);
  if (filters.available) catalogueQuery.set("available", filters.available === "yes" ? "true" : "false");
  if (filters.owner) catalogueQuery.set("owner", filters.owner);
  if (favoritesOnly) catalogueQuery.set("favoriteIds", favoriteBookIds.join(","));
  catalogueQuery.set("sort", sortOrder);
  const catalogueUrl = `/api/books?${catalogueQuery.toString()}`;
  const cataloguePageSize = 24;

  const handleZoneChange = (slug) => {
    if (!slug) return;
    setActiveZone(slug);
    localStorage.setItem("activeZone", slug);
    window.history.pushState({}, "", `/${slug}`);
    setShowZoneChooser(false);
  };

  useEffect(() => {
    api.get("/api/zones")
      .then((response) => {
        const availableZones = response.data.data || [];
        setZones(availableZones);
        const active = availableZones.find((zone) => zone.slug === activeZone);
        if (availableZones.length && (!active || active.enabled === false)) {
          handleZoneChange(availableZones.find((zone) => zone.enabled !== false)?.slug || availableZones[0].slug);
        }
      })
      .catch(() => setZones([{ name: "Heraklion", slug: "heraklion" }]));
  }, [activeZone]);

  const applyCatalogueBooks = (entries, append = false) => {
    const nextBooks = entries.map(normalizeBookAvailability);
    setBooks((current) => append ? [...current, ...nextBooks] : nextBooks);
  };

  const refreshCatalogue = async () => {
    const response = await api.get(`${catalogueUrl}&page=1&pageSize=${cataloguePageSize}`);
    applyCatalogueBooks(response.data.data || []);
    const pagination = response.data.meta?.pagination;
    setCatalogueTotal(Number(pagination?.total || 0));
    setCataloguePage(1);
    setCatalogueHasMore(Boolean(pagination && pagination.page < pagination.pageCount));
  };

  const loadMoreCatalogue = async () => {
    if (catalogueLoadingMore || !catalogueHasMore) return;
    setCatalogueLoadingMore(true);
    try {
      const nextPage = cataloguePage + 1;
      const response = await api.get(`${catalogueUrl}&page=${nextPage}&pageSize=${cataloguePageSize}`);
      applyCatalogueBooks(response.data.data || [], true);
      const pagination = response.data.meta?.pagination;
      setCatalogueTotal(Number(pagination?.total || 0));
      setCataloguePage(nextPage);
      setCatalogueHasMore(Boolean(pagination && pagination.page < pagination.pageCount));
    } finally {
      setCatalogueLoadingMore(false);
    }
  };

  const handleBookCreated = () => {
    refreshCatalogue()
      .catch((err) => console.error("Unable to refresh the book catalogue:", err));
  };

  const handleBookUpdated = (bookIdentifier, nextAvailable) => {
    if (bookIdentifier && nextAvailable !== undefined) {
      setBooks((current) => current.map((entry) => {
        const book = entry.attributes || entry;
        if (book.id !== bookIdentifier && book.documentId !== bookIdentifier) return entry;
        return entry.attributes
          ? { ...entry, attributes: { ...book, available: nextAvailable } }
          : { ...entry, available: nextAvailable };
      }));
    }
    refreshCatalogue()
      .catch((err) => console.error("Unable to refresh the book catalogue:", err));
  };


  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      api
        .get(`${catalogueUrl}&page=1&pageSize=${cataloguePageSize}`)
        .then((res) => {
          if (!cancelled) {
            applyCatalogueBooks(res.data.data || []);
            const pagination = res.data.meta?.pagination;
            setCatalogueTotal(Number(pagination?.total || 0));
            setCataloguePage(1);
            setCatalogueHasMore(Boolean(pagination && pagination.page < pagination.pageCount));
            setCatalogueState("ready");
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setCatalogueState(navigator.onLine ? "error" : "offline");
            console.error("Unable to refresh the book catalogue:", err);
          }
        });
    };

    const handleOffline = () => { if (!cancelled) setCatalogueState("offline"); };
    const handleOnline = () => { if (!cancelled) refresh(); };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    const initialRefreshTimer = window.setTimeout(refresh, 250);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      window.clearTimeout(initialRefreshTimer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [catalogueUrl]);

  useEffect(() => {
    const sentinel = catalogueSentinelRef.current;
    if (!sentinel || !catalogueHasMore) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMoreCatalogue();
    }, { rootMargin: "240px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [catalogueHasMore, cataloguePage, catalogueLoadingMore]);


  // Compute counts only when books change
  const ownerCounts = useMemo(() => {
    const counts = {};
    books.forEach((b) => {
      const ownerId = b.attributes?.owner?.id || b.owner?.id;
      if (!ownerId) return;
      counts[ownerId] = (counts[ownerId] || 0) + 1;
    });
    return counts;
  }, [books]);


  function normalize(str) {
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); // removes accents
  }

  const matchesFilters = (b, activeFilters) => {
    const book = b.attributes || b;
    const title = normalize(book.title || "");
    const author = normalize(book.author || "");
    const term = normalize(searchTerm);
  
    // Normalize owner name (for consistent comparison)
    const ownerName = normalize(book.owner?.username || "");
    const ownerFilter = normalize(activeFilters.owner || "");
  
    // Search term logic
    if (term && !title.includes(term) && !author.includes(term)) return false;
  
    // Age filter
    if (activeFilters.age && book.age !== activeFilters.age) return false;
  
    // Availability filter
    if (activeFilters.available) {
      if (activeFilters.available === "yes" && !book.available) return false;
      if (activeFilters.available === "no" && book.available) return false;
    }
  
    // Language filter
    if (activeFilters.language && book.language !== activeFilters.language) return false;
  
    // 🆕 Owner filter (accent & case insensitive + partial match)
    if (ownerFilter && !ownerName.includes(ownerFilter)) return false;

    const favoriteId = String(book.documentId || book.id || "");
    if (favoritesOnly && !favoriteBookIds.includes(favoriteId)) return false;
  
    return true;
  };
  const filteredBooks = books.filter((b) => matchesFilters(b, filters));
  const filterPreviewCount = books.filter((b) => matchesFilters(b, pendingFilters)).length;
  const activeFilterCount = Object.values(filters).filter((v) => v).length;
  const sortedBooks = [...filteredBooks].sort((leftEntry, rightEntry) => {
    const left = leftEntry.attributes || leftEntry;
    const right = rightEntry.attributes || rightEntry;
    if (sortOrder === "title-asc") return String(left.title || "").localeCompare(String(right.title || ""), undefined, { sensitivity: "base" });
    if (sortOrder === "title-desc") return String(right.title || "").localeCompare(String(left.title || ""), undefined, { sensitivity: "base" });
    if (sortOrder === "author-asc") return String(left.author || "").localeCompare(String(right.author || ""), undefined, { sensitivity: "base" });
    return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
  });
  const libraryStats = useMemo(() => books.reduce((stats, entry) => {
    const book = entry.attributes || entry;
    stats.total += 1;
    if (book.available) stats.available += 1;
    if ((book.loans || []).some((loan) => loan.status === "active" && loan.borrowerReceivedAt && !loan.lenderReceivedBackAt)) {
      stats.onLoan += 1;
    }
    return stats;
  }, { total: 0, available: 0, onLoan: 0 }), [books]);
  const catalogueIsFiltered = Boolean(searchTerm.trim() || activeFilterCount || favoritesOnly);

  return (
    <>
      <Header
        isLoggedIn={isLoggedIn}
        user={user}
        onLoginToggle={handleLoginToggle}
        activeZone={activeZone}
        zones={zones}
        onZoneChange={handleZoneChange}
        welcomeMessage={welcomeMessage}
        onDismissWelcome={() => setWelcomeMessage("")}
      />
      {showInstallPrompt && <div className="install-app-prompt" role="status">
        <div><strong>Add Maki Books to your home screen</strong><small>Open it quickly like an app whenever you want to borrow or share a book.</small></div>
        <div className="install-app-prompt-actions"><button type="button" className="btn btn-primary btn-sm" onClick={installApp}>Install</button><button type="button" className="btn btn-link btn-sm" onClick={dismissInstallPrompt}>Not now</button></div>
      </div>}
      <div className="catalog-sticky-controls">
        <div className="container">
          <div className="catalog-search-row">
            <input type="text" className="form-control" placeholder="Search by title or author..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            <button type="button" className="catalog-filter-trigger position-relative" data-bs-toggle="offcanvas" data-bs-target="#filterCanvas" aria-controls="filterCanvas" aria-label="Open book filters">
              <img src="/images/filtre.png" alt="" aria-hidden="true" />
              {activeFilterCount > 0 && <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-secondary">{activeFilterCount}</span>}
            </button>
          </div>
          <div className="library-summary" aria-live="polite">
            <span><strong>{catalogueIsFiltered ? `${sortedBooks.length}/${catalogueTotal}` : catalogueTotal}</strong> {catalogueIsFiltered ? "shown" : catalogueTotal === 1 ? "book" : "books"}</span>
            <span><strong>{libraryStats.available}</strong> available</span>
            <span><strong>{libraryStats.onLoan}</strong> on loan</span>
          </div>
        </div>
      </div>
      <FilterPanel filters={pendingFilters} setFilters={setPendingFilters} matchingCount={filterPreviewCount} onApply={() => setFilters(pendingFilters)} />

      {catalogueState !== "ready" && (
        <div className="container pt-3">
          <div className={`alert ${catalogueState === "offline" ? "alert-warning" : catalogueState === "loading" ? "alert-info" : "alert-danger"} d-flex align-items-center justify-content-between gap-3`} role="alert">
            <span>
              {catalogueState === "offline"
                ? "You appear to be offline. The book catalogue cannot be loaded right now."
                : catalogueState === "loading"
                ? "Loading the book catalogue…"
                : "The book catalogue could not be loaded. Please try again."}
            </span>
            {catalogueState !== "loading" && <button type="button" className="btn btn-sm btn-outline-dark" onClick={() => window.location.reload()}>Try again</button>}
          </div>
        </div>
      )}

      {showNotificationPrompt && <div className="install-app-prompt notification-app-prompt" role="status">
        <div><strong>Enable Maki Books notifications</strong><small>You can turn them on anytime to hear about new messages.</small></div>
        <div className="install-app-prompt-actions"><button type="button" className="btn btn-primary btn-sm" onClick={openNotificationSettings}>Settings</button><button type="button" className="btn btn-link btn-sm" onClick={dismissNotificationPrompt}>Not now</button></div>
      </div>}

      <div className="container pt-3 pb-4">
        <div className="library-sort-row">
          {favoritesOnly && <button type="button" className="favorites-filter-chip" onClick={() => setFavoritesOnly(false)}>♥ Favorites only ×</button>}
          <label className="library-sort-label" htmlFor="library-sort">
            <span className="visually-hidden">Sort by</span>
            <select id="library-sort" className="form-select form-select-sm" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
              <option value="newest">Newest first</option>
              <option value="title-asc">Title: A–Z</option>
              <option value="title-desc">Title: Z–A</option>
              <option value="author-asc">Author: A–Z</option>
            </select>
          </label>
        </div>
        {favoritesOnly && sortedBooks.length === 0 && <div className="favorites-empty-state">
          <span className="favorites-empty-icon" aria-hidden="true"><HeartCrack size={34} strokeWidth={1.6} /></span>
          <strong>{favoriteBookIds.length === 0 ? "No favorites yet." : "No favorites match your current filters."}</strong>
          <span>{favoriteBookIds.length === 0 ? "Tap the heart on any book to save it to your favorites." : "Try changing your search or filters to see more of your saved books."}</span>
        </div>}
        <div className="row g-3" style={{ paddingBottom: "80px" }}>
          {sortedBooks.map((b) => (
            <BookCard
            key={b.id}
            bookData={b}
            isFavorite={favoriteBookIds.includes(String((b.attributes || b).documentId || (b.attributes || b).id))}
            onFavoriteToggle={() => toggleFavorite(b)}
            onClick={() => {
              setSelectedBook(b);
              setShowModal(true);
            }}
          />
          ))}
        </div>
        <div ref={catalogueSentinelRef} className="catalogue-load-more text-center py-3" aria-live="polite">
          {catalogueLoadingMore && <small className="text-muted">Loading more books…</small>}
          {!catalogueLoadingMore && catalogueHasMore && <small className="text-muted">Scroll to discover more books…</small>}
        </div>
      </div>
      <SiteFooter canInstallApp={Boolean(installPromptEvent)} onInstallApp={installApp} />

      {showZoneChooser && zones.length > 0 && (
        <ZoneChooser zones={zones} activeZone={activeZone} onSelect={handleZoneChange} />
      )}

      {/* Modal */}
      <BookModal
        selectedBook={selectedBook}
        showModal={showModal}
        onClose={() => setShowModal(false)}
        onFilterByOwner={handleFilterByOwner}
        ownerCounts={ownerCounts}
        isLoggedIn={isLoggedIn}
        user={user}
        onBorrowRequested={handleBookUpdated}
        onOpenDiscussion={(conversationId) => setOpenConversationId(conversationId)}
        isFavorite={favoriteBookIds.includes(String((selectedBook?.attributes || selectedBook)?.documentId || (selectedBook?.attributes || selectedBook)?.id || ""))}
        onFavoriteToggle={() => toggleFavorite(selectedBook)}
      />
      <Footer
        isLoggedIn={isLoggedIn}
        onLoginToggle={handleLoginToggle}
        user={user}
        onBookCreated={handleBookCreated}
        onBookUpdated={handleBookUpdated}
        activeZone={activeZone}
        activeZoneDocumentId={zones.find((zone) => zone.slug === activeZone)?.documentId}
        favoritesCount={favoriteBookIds.length}
        favoritesOnly={favoritesOnly}
        onToggleFavorites={() => setFavoritesOnly((current) => !current)}
        openConversationId={openConversationId}
        onConversationOpened={() => setOpenConversationId(null)}
      />
      <LoginModal
        show={showLogin}
        onClose={() => setShowLogin(false)}
        onLoginSuccess={handleLoginSuccess}
      />  </>
  );
}

export default App;
