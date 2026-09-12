import React, { useRef, useState } from "react";
import { Trash } from "lucide-react";
import api, { mediaUrl } from "../../api";
import { languages } from "../../constants/languages";

const legacyText = (value) => Array.isArray(value)
  ? value.map((block) => Array.isArray(block?.children) ? block.children.map((child) => child?.text || "").join("") : "").filter(Boolean).join("\n")
  : typeof value === "string" ? value : "";

const loanTiming = (value) => {
  if (!value) return "";
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return "";
  const days = Math.max(1, Math.ceil((Date.now() - start.getTime()) / 86400000));
  return `since ${start.toLocaleDateString("en-GB")} (${days} day${days === 1 ? "" : "s"})`;
};

export default function BookActionsModal({ book, onClose, onUpdate, onOpenConversation }) {
  const [available, setAvailable] = useState(book.available);
  const isLended = book.lended === true;
  const hasLoanHistory = book.hasLoanHistory === true;
  const pendingRequests = book.pendingRequests || [];
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [conversationId, setConversationId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(book.title || "");
  const [author, setAuthor] = useState(book.author || "");
  const [language, setLanguage] = useState(book.language || "FR");
  const imported = book.catalogSource === "openlibrary";
  const oldDescription = legacyText(book.description);
  const [summary, setSummary] = useState(book.summary || (imported ? oldDescription : ""));
  const [ownerComment, setOwnerComment] = useState(book.ownerComment || (!imported ? oldDescription : ""));
  const [age, setAge] = useState(book.age || "adults");
  const [images, setImages] = useState(book.imageRecords || []);
  const [showImageChoices, setShowImageChoices] = useState(false);
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const bookIdentifier = book.documentId || book.id;

  const toggleAvailable = async () => {
    setError("");
    setSaving(true);
    try {
      const nextAvailable = !available;
      const response = await api.put(`/api/books/${bookIdentifier}`, { data: { available: nextAvailable } });
      const updated = { ...book, ...(response.data.data || {}), available: nextAvailable };
      setAvailable(nextAvailable);
      onUpdate(updated, { keepOpen: true });
    } catch (err) {
      setError(err.response?.data?.error?.message || "Unable to update availability.");
    } finally {
      setSaving(false);
    }
  };

  const saveDetails = async (event) => {
    event.preventDefault();
    if (!title.trim() || !author.trim()) { setError("Title and author are required."); return; }
    setError(""); setSaving(true);
    try {
      const newFiles = images.filter((image) => image instanceof File);
      if (newFiles.some((file) => !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024)) throw new Error("Each image must be an image file smaller than 5 MB.");
      let imageIds = images.filter((image) => image.id).map((image) => image.id);
      if (newFiles.length) { const formData = new FormData(); newFiles.forEach((file) => formData.append("files", file)); const upload = await api.post("/api/upload", formData); imageIds = [...imageIds, ...upload.data.map((item) => item.id)]; }
      const response = await api.put(`/api/books/${bookIdentifier}`, { data: { summary: summary.trim() || null, ownerComment: ownerComment.trim() || null, age, language, image: imageIds } });
      onUpdate({ ...book, ...(response.data.data || {}), title, author, language, summary, ownerComment, age, imageRecords: images });
    } catch (err) { setError(err.response?.data?.error?.message || err.message || "Unable to save book details."); }
    finally { setSaving(false); }
  };
  const removeImage = (index) => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index));
  const addImage = () => {
    if (images.length >= 2) return;
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) setShowImageChoices(true);
    else galleryInputRef.current?.click();
  };
  const handleImageSelection = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) { setError("Each image must be an image file smaller than 5 MB."); return; }
    if (images.length < 2) setImages((current) => [...current, file]);
    setShowImageChoices(false); event.target.value = "";
  };

  const removeBook = async () => {
    setError("");
    setConversationId(null);
    setSaving(true);
    try {
      await api.delete(`/api/books/${bookIdentifier}`);
      onUpdate(null); // remove from list
    } catch (err) {
      setError(err.response?.data?.error?.message || "Unable to remove this book.");
      setConversationId(err.response?.data?.error?.details?.conversationId || null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal fade show"
      style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
      tabIndex="-1"
      onClick={(event) => { if (!saving && event.target === event.currentTarget) onClose(); }}
      aria-busy={saving}
    >
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content book-editor">
          {saving && <div className="book-saving-overlay" role="status"><span>Saving…</span></div>}
          <div className="modal-header">
            <h5 className="modal-title">Manage this book</h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={saving}></button>
          </div>
          <form className="modal-body" onSubmit={saveDetails}>
            {error && <div className="alert alert-danger book-editor-error mb-3" role="alert">{error}</div>}
            {hasLoanHistory && <div className="alert alert-info mb-3">The title and author cannot be edited. You can update its other details at any time.</div>}
            {conversationId && (
              <a className="btn btn-outline-primary" href={`#conversation/${conversationId}`} onClick={onClose}>
                Open the discussion with the borrower
              </a>
            )}
            <fieldset className="book-editor-sections border-0 p-0 m-0" disabled={saving}>
              <section className="book-editor-section" aria-disabled={hasLoanHistory}>
                <h6 className="book-editor-section-title">The book</h6>
                {imported ? <div className="catalog-book-summary">
                  <img src={book.image ? mediaUrl(book.image) : book.coverUrl || "/images/open-book.png"} alt="" />
                  <div className="min-width-0"><strong>{book.title}</strong><span>{book.author}</span><small>{book.language} · Found in Open Library</small></div>
                </div> : <>
                  <label className="form-label">Title</label><input className="form-control mb-3" value={title} required disabled />
                  <label className="form-label">Author</label><input className="form-control" value={author} required disabled />
                </>}
                  <label className="form-label mt-3">Language</label><select className="form-select mb-3" value={language} onChange={(event) => setLanguage(event.target.value)}>{languages.map(([code, name]) => <option value={code} key={code}>{name} ({code})</option>)}</select>
                  <label className="form-label">Audience</label><select className="form-select mb-3" value={age} onChange={(event) => setAge(event.target.value)}><option value="young_children">Young children (0–6)</option><option value="children">Children (7–11)</option><option value="teenagers">Teenagers (12–17)</option><option value="adults">Adults (18+)</option></select>
                <><label className="form-label">Cover images</label><input ref={galleryInputRef} className="visually-hidden" type="file" accept="image/*" onChange={handleImageSelection} /><input ref={cameraInputRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={handleImageSelection} /><div className="cover-picker-row">{images.map((image, index) => <div className="cover-picker-image" key={image.id || `${image.name}-${image.lastModified}`}><img src={image instanceof File ? URL.createObjectURL(image) : mediaUrl(image.formats?.small?.url || image.formats?.thumbnail?.url || image.url)} alt={`Book cover ${index + 1}`} /><button type="button" className="cover-picker-remove" onClick={() => removeImage(index)} aria-label="Remove image">×</button></div>)}{images.length < 2 && <button type="button" className="cover-picker-placeholder" onClick={addImage} aria-label="Add a cover image"><span>＋</span></button>}{images.length === 2 && <button type="button" className="btn btn-outline-secondary btn-sm align-self-center" onClick={() => setImages((current) => [current[1], current[0]])}>Change order</button>}</div>{showImageChoices && <div className="image-choice-backdrop" role="dialog" aria-modal="true" onClick={() => setShowImageChoices(false)}><div className="image-choice-modal" onClick={(event) => event.stopPropagation()}><h6>Add a cover image</h6><p className="text-muted small">Choose where to get the image.</p><button type="button" className="btn btn-primary w-100 mb-2" onClick={() => cameraInputRef.current?.click()}>Take a photo</button><button type="button" className="btn btn-outline-primary w-100 mb-2" onClick={() => galleryInputRef.current?.click()}>Choose from gallery</button><button type="button" className="btn btn-link btn-sm" onClick={() => setShowImageChoices(false)}>Cancel</button></div></div>}</>
              </section>
              <section className="book-editor-section">
                <h6 className="book-editor-section-title">Tell readers about it</h6>
                <label className="form-label">Summary <span className="text-muted">(optional)</span></label><textarea className="form-control" rows="3" maxLength="1500" value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="What is this book about?" /><small className="book-field-help mb-3">{summary.length}/1500</small>
                <label className="form-label">Owner’s note <span className="text-muted">(optional)</span></label><textarea className="form-control" rows="2" maxLength="500" value={ownerComment} onChange={(event) => setOwnerComment(event.target.value)} placeholder="What did you think of it? Is there anything borrowers should know?" /><small className="book-field-help">{ownerComment.length}/500 · Please don’t include personal contact details.</small>
              </section>
              <section className="book-editor-section book-editor-sharing">
                <h6 className="book-editor-section-title">Sharing</h6>
                {isLended ? <>
                  <div className={`active-loan-summary loan-context-${book.loanReceived ? "active" : "accepted"}`}><strong>{book.loanReceived ? "Lent to" : "Awaiting pickup from"} {book.lendedTo || "another member"}</strong>{loanTiming(book.loanStartedAt) && <small>{loanTiming(book.loanStartedAt)}</small>}</div>
                  <p>{book.loanReceived ? "The borrower has this book. It will become available again after its return is confirmed." : `${book.lendedTo || "The borrower"} has not confirmed receiving this book yet.`}</p>
                  {book.loanConversationId && <button type="button" className="btn btn-outline-primary btn-sm mt-2" onClick={() => onOpenConversation?.(book.loanConversationId)}>Open the loan discussion</button>}
                </> : pendingRequests.length > 0 ? <>
                  <div className="pending-request-list">{[...pendingRequests].sort((first, second) => new Date(first.startedAt || 0) - new Date(second.startedAt || 0)).map((request, index) => <div className="pending-request-item" key={request.conversationId || `${request.borrower}-${index}`}>
                    <div className="active-loan-summary loan-context-requested"><strong>Pending request from {request.borrower}</strong>{loanTiming(request.startedAt) && <small>{loanTiming(request.startedAt)}</small>}</div>
                    {request.conversationId && <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => onOpenConversation?.(request.conversationId)}>Open discussion</button>}
                  </div>)}</div>
                  <p>{pendingRequests.length === 1 ? "Review this request in the discussion before accepting or refusing it." : "Review each request in its discussion."}</p>
                  <p className="book-editor-rule">If you accept one request, all other pending requests for this book will be refused automatically.</p>
                </> : <>
                  <div className="availability-toggle-row"><strong>{available ? "Available for borrowing" : "Not available for borrowing"}</strong><div className="form-check form-switch"><input className="form-check-input" id="manage-book-available" type="checkbox" role="switch" checked={available} onChange={toggleAvailable} disabled={saving} aria-label="Change borrowing availability" /></div></div>
                  <p>{available ? "Other members can find this book and send you a borrowing request." : "The book remains in your library, but other members cannot request it."}</p>
                </>}
              </section>
            </fieldset>
            <div className="book-editor-actions"><button type="button" className="btn btn-outline-danger btn-sm" onClick={() => setConfirmDelete(true)} disabled={saving}><Trash size={16} className="me-2" />Remove book</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></div>
          </form>
        </div>
      </div>
      {confirmDelete && (
        <div className="modal fade show" style={{ display: "block", backgroundColor: "rgba(0,0,0,0.35)" }} onClick={() => setConfirmDelete(false)}>
          <div className="modal-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Remove this book?</h5>
                <button type="button" className="btn-close" onClick={() => setConfirmDelete(false)} aria-label="Close"></button>
              </div>
              <div className="modal-body">{hasLoanHistory ? "This book will be removed from your library, but its lending history and discussions will be preserved." : "This action cannot be undone."}</div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>Keep book</button>
                <button type="button" className="btn btn-danger" onClick={() => { setConfirmDelete(false); removeBook(); }} disabled={saving}>Remove book</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
