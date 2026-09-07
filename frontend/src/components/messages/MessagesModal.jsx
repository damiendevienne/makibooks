import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowLeft, BookOpenCheck, ChevronDown, ChevronRight, Clock3, Send } from "lucide-react";
import api, { mediaUrl } from "../../api";

function otherParticipant(conversation, userId) {
  return conversation.participantOne?.id === userId
    ? conversation.participantTwo
    : conversation.participantOne;
}

function conversationBook(conversation) {
  return conversation.loans?.find((loan) => loan.book)?.book || null;
}

function bookImage(book) {
  const image = book?.image?.[0];
  return image ? mediaUrl(image.formats?.small?.url || image.formats?.medium?.url || image.url || image.attributes?.url) : book?.coverUrl || "/images/open-book.png";
}

function loanStateSignature(conversation) {
  return JSON.stringify((conversation.loans || []).map((loan) => ({
    id: loan.documentId || loan.id,
    status: loan.status,
    borrowerReceivedAt: loan.borrowerReceivedAt,
    lenderLentAt: loan.lenderLentAt,
    borrowerReturnedAt: loan.borrowerReturnedAt,
    lenderReceivedBackAt: loan.lenderReceivedBackAt,
  })));
}

function loanContext(conversation, userId) {
  const loan = conversation.loans?.find((item) => item.status === "requested" || item.status === "active") || conversation.loans?.[0];
  if (!loan) return { label: "Discussion", tone: "neutral" };
  const other = otherParticipant(conversation, userId)?.username || "User";
  if (loan.status === "requested") {
    return { label: loan.lender?.id === userId ? `Pending request from ${other}` : `Pending request to ${other}`, tone: "requested" };
  }
  if (loan.status === "active") {
    if (!loan.borrowerReceivedAt) {
      return { label: loan.lender?.id === userId ? `Awaiting pickup from ${other}` : `Pickup pending from ${other}`, tone: "accepted" };
    }
    return { label: loan.lender?.id === userId ? `Lent to ${other}` : `Borrowed from ${other}`, tone: "active" };
  }
  if (loan.status === "refused") return { label: loan.lender?.id === userId ? `You declined the request from ${other}` : `${other} declined your request`, tone: "past" };
  if (loan.status === "cancelled") return { label: loan.borrower?.id === userId ? "You cancelled the request" : `${other} cancelled the request`, tone: "past" };
  return { label: `Past loan with ${other}`, tone: "past" };
}

function loanTiming(loan) {
  if (!loan) return "";
  const start = loan.borrowerReceivedAt || loan.updatedAt || loan.createdAt;
  if (!start) return "";
  if (loan.status === "returned") {
    const end = loan.lenderReceivedBackAt || loan.updatedAt;
    const days = Math.max(1, Math.ceil((new Date(end) - new Date(start)) / 86400000));
    return `Loan duration: ${days} day${days === 1 ? "" : "s"}`;
  }
  if (loan.status === "refused") {
    const days = Math.max(1, Math.ceil((new Date(loan.updatedAt || start) - new Date(loan.createdAt || start)) / 86400000));
    return `Request duration: ${days} day${days === 1 ? "" : "s"}`;
  }
  const date = new Date(start).toLocaleDateString();
  return loan.status === "requested" ? `Since ${date}` : loan.borrowerReceivedAt ? `Since ${date}` : `Accepted on ${date}`;
}

function messageTime(value) {
  if (!value) return "";
  const date = new Date(value); const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  return date.toDateString() === yesterday.toDateString() ? "Yesterday" : date.toLocaleDateString();
}

function messageDayLabel(value) {
  if (!value) return "";
  const date = new Date(value); const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
}

function renderLoanReminder(content) {
  const match = content.match(/^Loan reminder: (you have had “.*?” for )(three|four|\d+) (weeks?|week)(\..*)$/);
  if (!match) return content;
  return <><div className="loan-reminder-heading">Loan reminder</div><div>{match[1]}<strong className="loan-reminder-duration">{match[2]} {match[3]}</strong>{match[4]}</div></>;
}

export default function MessagesModal({ show, onClose, onContextBack, user, activeZone, onUnreadCountChange, onBookUpdated, initialConversationId }) {
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [returnMessage, setReturnMessage] = useState(null);
  const [sendingReturnMessage, setSendingReturnMessage] = useState(false);
  const [pendingLoanAction, setPendingLoanAction] = useState(null);
  const [collapsedDiscussionGroups, setCollapsedDiscussionGroups] = useState({ "past-owned": true, "past-borrowed": true });
  const returnMessageRef = useRef(null);
  const conversationThreadRef = useRef(null);
  const closeModal = () => { setActive(null); onClose(); };

    const loadConversations = useCallback(() => api.get(`/api/conversations/mine?zone=${encodeURIComponent(activeZone || "heraklion")}`).then((res) => {
    const next = res.data.data || [];
    setConversations(next);
    setActive((current) => {
      if (!current) return current;
      const refreshed = next.find((item) => (item.documentId || item.id) === (current.documentId || current.id));
      if (!refreshed || loanStateSignature(refreshed) === loanStateSignature(current)) return current;
      return refreshed;
    });
    onUnreadCountChange?.(next.reduce((sum, item) => {
      const pendingRequest = item.loans?.some((loan) => loan.status === "requested" && loan.lender?.id === user.id);
      const pendingCancellation = item.loans?.some((loan) => loan.status === "cancelled" && loan.lender?.id === user.id && !item.lenderArchivedAt);
      return sum + Math.max(item.unreadCount || 0, pendingRequest ? 1 : 0, pendingCancellation ? 1 : 0);
    }, 0));
    return next;
  }), [activeZone, onUnreadCountChange, user?.id]);
  useEffect(() => {
    if (!show || !user?.id) return undefined;
    loadConversations().catch((err) => setError(err.response?.data?.error?.message || "Unable to load messages."));
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") loadConversations().catch(() => {});
    };
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [show, user?.id, loadConversations]);
  useEffect(() => {
    if (!show || !initialConversationId || conversations.length === 0) return;
    const requested = conversations.find((conversation) => String(conversation.documentId || conversation.id) === String(initialConversationId));
    if (requested) setActive((current) => String(current?.documentId || current?.id || "") === String(initialConversationId) ? current : requested);
  }, [show, initialConversationId, conversations]);
  useEffect(() => {
    if (!active) return;
    const conversationId = active.documentId || active.id;
    const loadMessages = () => api.get(`/api/conversations/${conversationId}/messages`)
      .then((res) => setMessages(res.data.data || []))
      .catch((err) => setError(err.response?.data?.error?.message || "Unable to load this conversation."));
    loadMessages();
    api.post(`/api/conversations/${conversationId}/read`).then(() => {
      // Clear ordinary message badges immediately after the thread has been
      // opened. The next refresh still reconciles the count with the server. A lender's
      // pending request remains visible until it is accepted or refused.
      setConversations((current) => {
        const next = current.map((item) => {
          if (String(item.documentId || item.id) !== String(conversationId)) return item;
          const pendingRequest = item.loans?.some((loan) => loan.status === "requested" && loan.lender?.id === user.id);
          const pendingCancellation = item.loans?.some((loan) => loan.status === "cancelled" && loan.lender?.id === user.id && !item.lenderArchivedAt);
          return { ...item, unreadCount: Math.max(pendingRequest ? 1 : 0, pendingCancellation ? 1 : 0) };
        });
        onUnreadCountChange?.(next.reduce((sum, item) => {
          const pendingRequest = item.loans?.some((loan) => loan.status === "requested" && loan.lender?.id === user.id);
          const pendingCancellation = item.loans?.some((loan) => loan.status === "cancelled" && loan.lender?.id === user.id && !item.lenderArchivedAt);
          return sum + Math.max(item.unreadCount || 0, pendingRequest ? 1 : 0, pendingCancellation ? 1 : 0);
        }, 0));
        return next;
      });
      return loadConversations();
    }).catch(() => {});
    // Keep both sides of an open discussion in sync while they are viewing it.
    // The app has no websocket connection, so a short poll is the reliable
    // fallback for new messages and loan status changes.
    const refreshTimer = window.setInterval(() => {
      loadMessages();
      api.post(`/api/conversations/${conversationId}/read`).catch(() => {});
      loadConversations().catch(() => {});
    }, 3000);
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") loadMessages();
    };
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
      window.clearInterval(refreshTimer);
    };
  }, [active, loadConversations]);
  useEffect(() => {
    if (returnMessage === null) return;
    const input = returnMessageRef.current;
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }, [returnMessage]);

  const loans = useMemo(() => active?.loans || [], [active]);
  const actionPanelSignature = loans.map((loan) => `${loan.documentId || loan.id}:${loan.status}:${loan.borrowerReceivedAt || ""}:${loan.lenderReceivedBackAt || ""}`).join("|");
  useEffect(() => {
    const thread = conversationThreadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [active?.documentId, active?.id, messages.length, actionPanelSignature]);
  const hasOpenLoan = loans.some((loan) => loan.status === "requested" || loan.status === "active");
  const withinGracePeriod = active?.closedAt && Date.now() - new Date(active.closedAt).getTime() < 24 * 60 * 60 * 1000;
  const conversationClosed = Boolean(loans.length && !hasOpenLoan && !withinGracePeriod);
  // Both sides can discuss a pending request. The owner may need to ask a
  // question before deciding whether to accept it.
  const chatLocked = conversationClosed;
  const refusalIsArchived = (conversation) => {
    const loan = conversation.loans?.find((item) => item.status === "refused");
    if (!loan) return false;
    return loan.lender?.id === user.id ? Boolean(conversation.lenderArchivedAt) : Boolean(conversation.borrowerArchivedAt);
  };
  const hasCurrentActivity = (conversation) => conversation.loans?.some((loan) => loan.status === "requested" || loan.status === "active")
    || (conversation.loans?.some((loan) => loan.status === "refused") && !refusalIsArchived(conversation))
    || (conversation.loans?.some((loan) => loan.status === "cancelled" && loan.lender?.id === user.id) && !conversation.lenderArchivedAt);
  const isRecentlyCompleted = (conversation) => Boolean(conversation.closedAt)
    && Date.now() - new Date(conversation.closedAt).getTime() < 24 * 60 * 60 * 1000
    && conversation.loans?.some((loan) => loan.status === "returned")
    && !conversation.loans?.some((loan) => loan.status === "requested" || loan.status === "active");
  const currentConversations = conversations.filter((conversation) => hasCurrentActivity(conversation) && !isRecentlyCompleted(conversation));
  const recentlyCompletedConversations = conversations.filter(isRecentlyCompleted);
  const pastConversations = conversations.filter((conversation) => !hasCurrentActivity(conversation) && !isRecentlyCompleted(conversation));
  const splitByOwnership = (items) => items.reduce((groups, conversation) => {
    const loan = conversation.loans?.find((item) => item.status === "requested" || item.status === "active") || conversation.loans?.[0];
    if (loan?.lender?.id === user.id) groups.owned.push(conversation);
    else groups.borrowed.push(conversation);
    return groups;
  }, { owned: [], borrowed: [] });
  const activeGroups = splitByOwnership(currentConversations);
  const recentGroups = splitByOwnership(recentlyCompletedConversations);
  const pastGroups = splitByOwnership(pastConversations);
  const discussionSections = [
    { label: "Active loans", tone: "active", groups: activeGroups },
    { label: "Recently completed", tone: "recent", groups: recentGroups },
    { label: "Past loans", tone: "past", groups: pastGroups },
  ].filter((section) => section.groups.owned.length || section.groups.borrowed.length);

  const archiveRefusal = async () => {
    if (!active) return;
    try {
      await api.post(`/api/conversations/${active.documentId || active.id}/archive`);
      await loadConversations();
      setActive(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || "Unable to archive this discussion.");
    }
  };

  const systemMessageText = (message) => {
    if (!message.isSystem) return message.content;
    const loan = loans.find((item) => item.book);
    const book = loan?.book;
  if (message.content?.startsWith("You can now discuss") && book) {
      const ownerName = otherParticipant(active, user.id)?.username || "the owner";
      if (loan?.lender?.id === user.id) {
        return `You can now discuss and arrange a time and place to hand over “${book.title}”.`;
      }
      if (loan?.borrower?.id === user.id) {
        return `You can now discuss and arrange a time and place to pick up “${book.title}” from ${ownerName}.`;
      }
    }
    if (message.content?.startsWith("The borrower confirmed receiving the book.")) {
      if (loan?.borrower?.id === user.id) {
        const ownerName = otherParticipant(active, user.id)?.username || "the owner";
        return `You confirmed that you received the book. Enjoy your reading!\n\nWhen you’ve finished it, use the button below to arrange the return with ${ownerName}. Once ${ownerName} confirms its return, the book will become available for others to borrow again.`;
      }
      return `${loan?.borrower?.username || otherParticipant(active, user.id)?.username || "The borrower"} confirmed receiving your book.`;
    }
    if (message.content?.startsWith("The borrowing request was cancelled by the borrower.")) {
      const borrowerName = loan?.borrower?.username || "The borrower";
      return loan?.borrower?.id === user.id ? "You cancelled this request." : `${borrowerName} cancelled this request.`;
    }
    if (message.content?.startsWith("The loan was cancelled by the borrower after acceptance.")) {
      const borrowerName = loan?.borrower?.username || "The borrower";
      return loan?.borrower?.id === user.id
        ? "You changed your mind and cancelled the loan."
        : `${borrowerName} changed their mind and cancelled the loan.`;
    }
    if (message.content?.startsWith("You recovered your book")) {
      const recoveredAt = loan?.lenderReceivedBackAt || message.createdAt;
      const date = recoveredAt ? new Date(recoveredAt).toLocaleDateString() : "today";
      const bookTitle = book?.title || "the book";
      const closing = "This discussion remains available for 24 hours after the loan ends. It will then be archived in “Past loans”.";
      if (loan?.lender?.id === user.id) {
        return `You recovered “${bookTitle}” on ${date}. The book is available again for borrowing. Thanks for lending books and helping make sharing possible!\n\n${closing}`;
      }
      const ownerName = loan?.lender?.username || "The owner";
      return `You gave “${bookTitle}” back to ${ownerName} on ${date}. The book is available again for borrowing. Thanks for helping keep book sharing going!\n\n${closing}`;
    }
    if (!message.content?.startsWith("Borrow request for") || !book) return message.content;
    // This is a historical event. Keep it visible after the request is accepted
    // or refused instead of deriving its text from the loan's current status.
    const bookName = `“${book.title}${book.author ? `” by ${book.author}` : "”"}`;
    if (loan.borrower?.id === user.id) {
      return `You asked to borrow ${bookName} from ${otherParticipant(active, user.id)?.username || "the owner"}.`;
    }
    const borrowerName = loan.borrower?.username || otherParticipant(active, user.id)?.username || "the borrower";
    return `${borrowerName} asked to borrow your book ${bookName}.`;
  };
  const sendMessage = async (event) => {
    event.preventDefault();
    if (!draft.trim() || !active || chatLocked) return;
    try {
      const res = await api.post(`/api/conversations/${active.documentId || active.id}/messages`, { content: draft.trim() });
      setMessages((current) => [...current, res.data.data]);
      setDraft("");
      await loadConversations();
    } catch (err) { setError(err.response?.data?.error?.message || "Unable to send message."); }
  };

  const openReturnComposer = () => {
    const ownerName = otherParticipant(active, user.id)?.username || "there";
    setReturnMessage(`Hi ${ownerName}, I’ve finished the book and I’m ready to return it. When would be a good time for you?`);
  };

  const sendReturnMessage = async (event) => {
    event.preventDefault();
    if (!returnMessage?.trim() || !active || sendingReturnMessage) return;
    setSendingReturnMessage(true);
    try {
      const res = await api.post(`/api/conversations/${active.documentId || active.id}/messages`, { content: returnMessage.trim(), purpose: "returnArrangement" });
      setMessages((current) => [...current, res.data.data]);
      setReturnMessage(null);
      await loadConversations();
    } catch (err) {
      setError(err.response?.data?.error?.message || "Unable to send message.");
    } finally {
      setSendingReturnMessage(false);
    }
  };

  const loanAction = async (loan, action) => {
    try {
      const endpointAction = action === "cancel-active" ? "cancel" : action;
      await api.post(`/api/loans/${loan.documentId || loan.id}/${endpointAction}`);
      if (action === "accept") {
        const book = conversationBook(active);
        onBookUpdated?.(book?.documentId || book?.id, false);
      } else {
        onBookUpdated?.();
      }
      const nextConversations = await loadConversations();
      const refreshed = nextConversations.find((item) => (item.documentId || item.id) === (active.documentId || active.id));
      if (refreshed) setActive(refreshed);
      const fresh = (await api.get(`/api/conversations/${active.documentId || active.id}/messages`)).data.data || [];
      setMessages(fresh);
    } catch (err) { setError(err.response?.data?.error?.message || "Unable to update this loan."); }
  };

  const askLoanAction = (loan, action) => setPendingLoanAction({ loan, action });
  const confirmLoanAction = async () => {
    if (!pendingLoanAction) return;
    const action = pendingLoanAction;
    setPendingLoanAction(null);
    await loanAction(action.loan, action.action);
  };
  const confirmationCopy = pendingLoanAction?.action === "confirm-received"
    ? { title: "Confirm book reception", body: "Confirm that you received the book in person? This will record the handover." }
    : pendingLoanAction?.action === "cancel-active"
      ? { title: "Cancel this loan?", body: "Cancel because you changed your mind? The owner will be notified and the book will become available again." }
      : { title: "Confirm book recovery", body: "Confirm that you recovered your book? This will complete the loan and make the book available for others again." };

  if (!show || !user?.id) return null;
  return <div className="modal fade show" style={{ display: "block", backgroundColor: "rgba(0,0,0,.5)" }} onClick={closeModal}>
    <div className="modal-dialog modal-lg modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
      <div className="modal-content">
        <div className="modal-header"><div><h5 className="modal-title mb-0">Discussions</h5><small className="text-muted">Borrow, lend and arrange returns</small></div><button className="btn-close" onClick={closeModal} aria-label="Close discussions" /></div>
        <div className={`modal-body p-0 ${active ? "messages-modal-body-active" : ""}`}>
          {error && <div className="alert alert-danger m-3">{error}</div>}
          {!active ? <div className="list-group list-group-flush">
            {conversations.length === 0 && <p className="px-3 pb-3 text-muted text-center mb-0">No discussions yet. When you request to borrow a book or someone requests one of yours, you’ll be able to discuss the exchange, meeting arrangements and returns here.</p>}
            {discussionSections.map((section) => <React.Fragment key={section.tone}>
              <div className={`conversation-section-heading conversation-section-${section.tone} px-3 py-2 text-uppercase small fw-bold`}>
                {section.tone === "active" ? <BookOpenCheck size={16} aria-hidden="true" /> : section.tone === "recent" ? <Clock3 size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
                <span>{section.label}</span>
              </div>
              {[{ label: "My books", ownership: "owned", items: section.groups.owned }, { label: "Borrowed books", ownership: "borrowed", items: section.groups.borrowed }].filter((group) => group.items.length).map((group) => {
                const groupKey = `${section.tone}-${group.ownership}`;
                const isCollapsed = Boolean(collapsedDiscussionGroups[groupKey]);
                return <React.Fragment key={group.ownership}>
                <button type="button" className={`conversation-subsection-heading conversation-subsection-${section.tone} px-3 py-2 text-uppercase fw-bold`} aria-expanded={!isCollapsed} onClick={() => setCollapsedDiscussionGroups((current) => ({ ...current, [groupKey]: !current[groupKey] }))}>
                  <span>{group.label} ({group.items.length})</span>
                  {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                </button>
                {!isCollapsed && group.items.map((conversation) => {
                  const book = conversationBook(conversation);
                  const context = loanContext(conversation, user.id);
                  const other = otherParticipant(conversation, user.id);
                  return <button key={conversation.documentId || conversation.id} className={`list-group-item list-group-item-action text-start conversation-item-${section.tone}`} onClick={() => { setError(""); setActive(conversation); const pendingRequest = conversation.loans?.some((loan) => loan.status === "requested" && loan.lender?.id === user.id); setConversations((current) => current.map((item) => (String(item.documentId || item.id) === String(conversation.documentId || conversation.id) ? { ...item, unreadCount: pendingRequest ? 1 : 0 } : item))); }}>
                    <span className="conversation-item-content">
                      <img className="conversation-book-thumbnail" src={bookImage(book)} alt="" aria-hidden="true" />
                      <span className="conversation-item-details"><strong className={`conversation-item-title ${conversation.unreadCount > 0 ? "fw-bold" : "fw-normal"}`}>{book?.title || "Conversation"}</strong>{book?.author && <small className="conversation-item-author d-block text-muted">{book.author}</small>}<small className="d-block conversation-with">Discussion with {other?.username || "User"}</small></span>
                      <span className={`badge loan-context-badge loan-context-${context.tone}`}>{context.label}</span>
                      <span className="conversation-item-meta">{conversation.unreadCount > 0 && <span className="badge rounded-pill bg-danger">{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</span>}<small className="text-muted">{messageTime(conversation.lastMessageAt || conversation.updatedAt)}</small></span>
                    </span>
                  </button>;
                })}
              </React.Fragment>;
              })}
            </React.Fragment>)}
          </div> : <div className="conversation-view d-flex flex-column">
            <div className="border-bottom p-2">
              <div className="conversation-header-content">
                <button className="conversation-back-button" onClick={() => { setActive(null); onContextBack?.(); }} aria-label={onContextBack ? "Back to book details" : "Back to conversations"}><ArrowLeft size={20} /></button>
                <img className="conversation-book-thumbnail conversation-header-thumbnail" src={bookImage(conversationBook(active))} alt="" aria-hidden="true" />
                  <div className="conversation-header-info">
                    <strong className="d-block conversation-header-title">{conversationBook(active)?.title || "Conversation"}</strong>
                    {conversationBook(active)?.author && <small className="d-block conversation-header-author">{conversationBook(active).author}</small>}
                    <small className="d-block conversation-with">Discussion with {otherParticipant(active, user.id)?.username || "User"}</small>
                  </div>
                  <div className="conversation-header-status">
                    <span className={`badge loan-context-badge loan-context-${loanContext(active, user.id).tone}`}>{loanContext(active, user.id).label}</span>
                    {loanTiming(active.loans?.find((loan) => loan.status === "requested" || loan.status === "active") || active.loans?.[0]) && <small className="conversation-timing">{loanTiming(active.loans?.find((loan) => loan.status === "requested" || loan.status === "active") || active.loans?.[0])}</small>}
                  </div>
              </div>
            </div>
            <div ref={conversationThreadRef} className="conversation-thread flex-grow-1 p-3 overflow-auto">
              {(() => { let previousDay = ""; return messages.map((message) => {
                const handoverNotice = message.isSystem && message.content?.startsWith("You can now discuss");
                const refusalNotice = message.isSystem && message.content?.startsWith("The loan request was refused");
                const receiptNotice = message.isSystem && message.content?.startsWith("The borrower confirmed receiving the book.");
                const completionNotice = message.isSystem && message.content?.startsWith("You recovered your book");
                const requestNotice = message.isSystem && message.content?.startsWith("Borrow request for");
                const cancelledNotice = message.isSystem && (message.content?.startsWith("The borrowing request was cancelled by the borrower.") || message.content?.startsWith("The loan was cancelled by the borrower after acceptance."));
                const loanReminderNotice = message.isSystem && message.content?.startsWith("Loan reminder:");
                if (loanReminderNotice && message.sender?.id === user.id) return null;
                const content = systemMessageText(message);
                if (content === null) return null;
                const handoverLoan = handoverNotice ? loans.find((loan) => loan.book) : null;
                const handoverConfirmation = handoverLoan?.borrower?.id === user.id
                  ? `${handoverLoan?.lender?.username || otherParticipant(active, user.id)?.username || "The owner"} accepted your request.`
                  : handoverLoan?.lender?.id === user.id
                    ? `You accepted ${handoverLoan.borrower?.username || otherParticipant(active, user.id)?.username || "the borrower"}’s request to borrow your book.`
                    : "";
                const borrowerReceiptNotice = receiptNotice && loans.some((loan) => loan.borrower?.id === user.id);
                const returnAlreadyArranged = messages.some((item) => item.purpose === "returnArrangement" && item.sender?.id === user.id);
                const canArrangeReturn = borrowerReceiptNotice && !returnAlreadyArranged && loans.some((loan) => loan.status === "active" && loan.borrower?.id === user.id && loan.borrowerReceivedAt && !loan.lenderReceivedBackAt);
                const [receiptConfirmation, returnGuidance] = borrowerReceiptNotice ? content.split("\n\n") : [];
                const refusedLoan = loans.find((loan) => loan.status === "refused");
                const refusalArchived = refusedLoan && (refusedLoan.lender?.id === user.id ? active.lenderArchivedAt : active.borrowerArchivedAt);
                const cancelledLoan = loans.find((loan) => loan.status === "cancelled");
                const cancellationPendingArchive = cancelledLoan?.lender?.id === user.id && !active.lenderArchivedAt;
                const dayKey = message.createdAt ? new Date(message.createdAt).toDateString() : "";
                const showDay = dayKey && dayKey !== previousDay;
                previousDay = dayKey || previousDay;
                return <React.Fragment key={message.id}>
                  {showDay && <div className="message-date-separator">{messageDayLabel(message.createdAt)}</div>}
                  <div className={`mb-2 ${handoverNotice || refusalNotice || receiptNotice || completionNotice || requestNotice || cancelledNotice || loanReminderNotice ? "system-notice" : message.sender?.id === user.id ? "text-end" : ""}`}>
                  {handoverNotice || refusalNotice || receiptNotice || completionNotice || requestNotice || cancelledNotice || loanReminderNotice ? <div className={handoverNotice ? (handoverConfirmation ? "handover-notice acceptance-handover-notice" : "handover-notice") : refusalNotice ? "refusal-notice" : completionNotice ? "completion-notice" : requestNotice ? "request-notice" : cancelledNotice ? "cancellation-notice" : loanReminderNotice ? "loan-reminder-notice" : "acceptance-notice"}>
                    {handoverConfirmation && <div className="acceptance-notice-inline">{handoverConfirmation}</div>}
                    {refusalNotice ? <><div>{refusedLoan?.lender?.id === user.id ? `You declined ${refusedLoan?.borrower?.username || "the requester"}’s loan request. They were notified.` : <strong>{`Sorry, your loan request wasn’t accepted by ${refusedLoan?.lender?.username || "the owner"}. The book may have been reserved or lent to someone else.`}</strong>}</div>{!refusalArchived && <><small className="refusal-archive-hint">Clicking OK will archive this discussion.</small><button type="button" className="btn btn-sm refusal-confirm-button mt-2" onClick={archiveRefusal}>OK</button></>}</> : null}
                    {borrowerReceiptNotice ? <>
                      <div className="receipt-confirmation-message">{receiptConfirmation}</div>
                      <div className={`return-guidance-message ${returnAlreadyArranged ? "return-arranged-message" : ""}`}>
                        {returnAlreadyArranged
                          ? `Return arrangement started with ${otherParticipant(active, user.id)?.username || "the owner"}. Continue the conversation in the chat.`
                          : returnGuidance}
                      </div>
                      {canArrangeReturn && <button type="button" className="btn btn-outline-success btn-sm arrange-return-button" onClick={openReturnComposer}>Arrange the return</button>}
                    </> : cancelledNotice ? <>{content}{cancellationPendingArchive && <><small className="refusal-archive-hint d-block mt-2">Clicking OK will archive this discussion.</small><button type="button" className="btn btn-sm refusal-confirm-button mt-2" onClick={archiveRefusal}>OK</button></>}</> : loanReminderNotice ? renderLoanReminder(content) : !refusalNotice && content}
                  </div> : <span className={`d-inline-block rounded px-3 py-2 ${message.isSystem ? "bg-light text-muted" : message.sender?.id === user.id ? "message-bubble message-outgoing" : "message-bubble message-incoming"}`}>{content}</span>}
                  {message.createdAt && <small className="message-time">{messageTime(message.createdAt)}</small>}
                  </div>
                </React.Fragment>;
              }); })()}
              {loans.filter((loan) => loan.status === "requested" && loan.lender?.id === user.id).map((loan) => <div className="loan-request-actions text-center mt-3" key={loan.documentId || loan.id}>
                <button className="btn btn-sm btn-success me-2" onClick={() => loanAction(loan, "accept")}>Accept</button>
                <button className="btn btn-sm btn-outline-danger" onClick={() => loanAction(loan, "refuse")}>Refuse</button>
              </div>)}
              {loans.filter((loan) => loan.status === "active" && loan.lender?.id === user.id && !loan.borrowerReceivedAt).map((loan) => <div className="handover-waiting-notice" key={loan.documentId || loan.id}>
                Once you have handed over the book, ask {loan.borrower?.username || "the borrower"} to click “I received the book”.
              </div>)}
            </div>
            {loans.filter((loan) => loan.status === "requested" && loan.borrower?.id === user.id).map((loan) => <div className="loan-request-actions text-center" key={`cancel-request-${loan.documentId || loan.id}`}>
              <span className="text-muted small me-2">Changed your mind?</span><button className="btn btn-sm btn-outline-danger" onClick={() => loanAction(loan, "cancel")}>Cancel request</button>
            </div>)}
            {loans.filter((loan) => loan.status === "active" && loan.borrower?.id === user.id && !loan.borrowerReceivedAt).map((loan) => <div className="receipt-action-card" key={loan.documentId || loan.id}>
              <div className="receipt-action-copy">
                <div className="receipt-action-title">Have you received the book?</div>
                <div className="receipt-action-help">Confirm this only after the handover has taken place.</div>
              </div>
              <button className="btn btn-success receipt-action-button" onClick={() => askLoanAction(loan, "confirm-received")}>✓ I received the book</button>
            </div>)}
            {loans.filter((loan) => loan.status === "active" && loan.borrower?.id === user.id && !loan.borrowerReceivedAt).map((loan) => <div className="loan-request-actions text-center" key={`cancel-${loan.documentId || loan.id}`}>
              <span className="text-muted small me-2">Changed your mind?</span><button className="btn btn-sm btn-outline-danger" onClick={() => askLoanAction(loan, "cancel-active")}>Cancel request</button>
            </div>)}
            {loans.filter((loan) => loan.status === "active" && loan.lender?.id === user.id && loan.borrowerReceivedAt && !loan.lenderReceivedBackAt).map((loan) => <div className="receipt-action-card" key={loan.documentId || loan.id}>
              <div className="receipt-action-copy">
                <div className="receipt-action-title">You lent this book to {loan.borrower?.username || otherParticipant(active, user.id)?.username || "the borrower"} on {new Date(loan.borrowerReceivedAt).toLocaleDateString()}.</div>
                <div className="receipt-action-help">When the borrower returns it, click below to confirm that you received it back. The book will then become available for others to borrow again.</div>
              </div>
              <button className="btn btn-success receipt-action-button" onClick={() => askLoanAction(loan, "confirm-received-back")}>✓ I recovered my book</button>
            </div>)}
            <form className="conversation-compose-bar border-top p-2 d-flex gap-2" onSubmit={sendMessage}>
              <input className="form-control" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={chatLocked} placeholder={conversationClosed ? "This discussion is archived." : "Write a message…"} />
              <button className="btn btn-primary" disabled={chatLocked || !draft.trim()}><Send size={17} /></button>
            </form>
          </div>}
        </div>
      </div>
    </div>
    {returnMessage !== null && <div className="modal fade show return-composer-modal" style={{ display: "block", backgroundColor: "rgba(0,0,0,.45)" }} onClick={(event) => { event.stopPropagation(); setReturnMessage(null); }}>
      <div className="modal-dialog modal-dialog-centered" onClick={(event) => event.stopPropagation()}>
        <form className="modal-content" onSubmit={sendReturnMessage}>
          <div className="modal-header">
            <h5 className="modal-title">Arrange the return</h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={() => setReturnMessage(null)} />
          </div>
          <div className="modal-body">
            <label className="form-label" htmlFor="return-message">Message to {otherParticipant(active, user.id)?.username || "the owner"}</label>
            <textarea id="return-message" ref={returnMessageRef} className="form-control" rows="4" value={returnMessage} onChange={(event) => setReturnMessage(event.target.value)} />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" disabled={sendingReturnMessage} onClick={() => setReturnMessage(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={sendingReturnMessage || !returnMessage.trim()} aria-label="Send return message">
              {sendingReturnMessage ? "Sending…" : <><Send size={17} /> <span>Send</span></>}
            </button>
          </div>
        </form>
      </div>
    </div>}
    {pendingLoanAction && <div className="modal fade show loan-confirmation-modal" style={{ display: "block", backgroundColor: "rgba(0,0,0,.45)" }} onClick={() => setPendingLoanAction(null)}>
      <div className="modal-dialog modal-dialog-centered" onClick={(event) => event.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{confirmationCopy.title}</h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={() => setPendingLoanAction(null)} />
          </div>
          <div className="modal-body"><p className="mb-0">{confirmationCopy.body}</p></div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setPendingLoanAction(null)}>Cancel</button>
            <button type="button" className="btn btn-success" onClick={confirmLoanAction}>OK</button>
          </div>
        </div>
      </div>
    </div>}
  </div>;
}
