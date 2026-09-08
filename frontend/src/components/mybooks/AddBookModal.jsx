import React, { useEffect, useRef, useState } from "react";
import api from "../../api";
import { languages } from "../../constants/languages";
import { BookPlus } from "lucide-react";

const initialForm = { title: "", author: "", summary: "", ownerComment: "", language: "FR", age: "adults", available: true, coverUrl: "", isbn: "", catalogSource: "", catalogId: "" };
const MAX_IMAGES = 2;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const TARGET_IMAGE_SIZE = 2.5 * 1024 * 1024;
const MAX_SOURCE_IMAGE_SIZE = 20 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1800;

async function compressImage(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= TARGET_IMAGE_SIZE) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob || blob.size > MAX_IMAGE_SIZE) throw new Error("IMAGE_TOO_LARGE");
  if (blob.size >= file.size && file.size <= MAX_IMAGE_SIZE) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg", lastModified: Date.now() });
}

export default function AddBookModal({ show, onClose, onCreated, zoneSlug = "heraklion", zoneDocumentId }) {
  const [form, setForm] = useState(initialForm);
  const [images, setImages] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogResults, setCatalogResults] = useState([]);
  const [catalogSearching, setCatalogSearching] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [catalogBook, setCatalogBook] = useState(null);
  const [showImageChoices, setShowImageChoices] = useState(false);
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    if (!show || manualMode || catalogQuery.trim().length < 2) { setCatalogResults([]); return undefined; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setCatalogSearching(true); setCatalogError("");
      api.get(`/api/book-catalog/search?q=${encodeURIComponent(catalogQuery.trim())}`)
        .then((response) => { if (!cancelled) setCatalogResults(response.data.data || []); })
        .catch(() => { if (!cancelled) setCatalogError("Unable to search the book catalogue."); })
        .finally(() => { if (!cancelled) setCatalogSearching(false); });
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [show, manualMode, catalogQuery]);

  if (!show) return null;
  const update = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));
  const closeAndReset = () => { if (saving) return; setForm(initialForm); setImages([]); setCatalogQuery(""); setCatalogResults([]); setCatalogBook(null); setManualMode(false); setShowImageChoices(false); setError(""); onClose(); };
  const selectCatalogBook = (book) => { setForm((previous) => ({ ...previous, title: book.title, author: book.author || "", summary: book.summary || "", ownerComment: "", language: book.language || previous.language, coverUrl: book.coverUrl || "", isbn: book.isbn || "", catalogSource: "openlibrary", catalogId: book.id || "" })); setCatalogBook(book); setCatalogQuery(""); setCatalogResults([]); };
  const submit = async (event) => {
    event.preventDefault(); setError(""); setSaving(true);
    try {
      let imageIds;
      if (images.length) { const optimizedImages = await Promise.all(images.map(compressImage)); const files = new FormData(); optimizedImages.forEach((file) => files.append("files", file)); const upload = await api.post("/api/upload", files); imageIds = upload.data.map((item) => item.id); }
      const zoneIdentifier = zoneDocumentId || zoneSlug;
      const data = { title: form.title.trim(), author: form.author.trim(), language: form.language, age: form.age, available: form.available, summary: form.summary.trim() || null, ownerComment: form.ownerComment.trim() || null, zone: { connect: [zoneIdentifier] }, ...(form.coverUrl && !images.length && { coverUrl: form.coverUrl }), ...(form.isbn && { isbn: form.isbn.trim() }), ...(form.catalogSource && { catalogSource: form.catalogSource }), ...(form.catalogId && { catalogId: form.catalogId }), ...(imageIds?.length && { image: imageIds }) };
      const response = await api.post("/api/books", { data }); onCreated(response.data.data); closeAndReset();
    } catch (err) {
      const status = err.response?.status;
      setError(status === 413 || err.message === "IMAGE_TOO_LARGE"
        ? "This image could not be compressed enough. Please choose a smaller image."
        : status === 403 && images.length
          ? "You don't have permission to upload images. Please try again or contact support."
          : err.response?.data?.error?.message || "Unable to add this book.");
    } finally { setSaving(false); }
  };
  const handleImagesChange = (event) => {
    const selected = Array.from(event.target.files || []).slice(0, 1);
    const combined = [...images, ...selected];
    if (combined.length > MAX_IMAGES) { setError(`You can add up to ${MAX_IMAGES} images per book.`); event.target.value = ""; return; }
    const invalid = selected.find((file) => !file.type.startsWith("image/") || file.size > MAX_SOURCE_IMAGE_SIZE);
    if (invalid) { setImages([]); setError("Please choose an image file smaller than 20 MB."); event.target.value = ""; return; }
    setError(""); setImages(combined); setShowImageChoices(false); event.target.value = "";
  };
  const addImage = () => {
    if (images.length >= MAX_IMAGES) { setError(`You can add up to ${MAX_IMAGES} images per book.`); return; }
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) setShowImageChoices(true);
    else galleryInputRef.current?.click();
  };
  const chooseImageSource = (inputRef) => {
    setShowImageChoices(false);
    window.requestAnimationFrame(() => inputRef.current?.click());
  };
  const removeImage = (index) => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index));
  const swapImages = () => setImages((current) => current.length === 2 ? [current[1], current[0]] : current);
  const catalogSelected = !manualMode && !!catalogBook;
  return <div className="modal fade show" style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }} onClick={(event) => { if (event.target === event.currentTarget) closeAndReset(); }} aria-busy={saving}><div className="modal-dialog modal-lg" onClick={(event) => event.stopPropagation()}><form className="modal-content book-editor" onSubmit={submit}>
    {saving && <div className="book-saving-overlay" role="status"><span>Saving…</span></div>}
    <div className="modal-header"><h5 className="modal-title">Share a new book</h5><button type="button" className="btn-close" onClick={closeAndReset} aria-label="Close" /></div>
    <div className="modal-body">{error && <div className="alert alert-danger">{error}</div>}
      {!manualMode ? <div className="mb-3"><label className="form-label">Find the book you want to share</label><input className="form-control" value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Search by title, author or ISBN…" autoFocus /><div className="catalog-search-status"><small className="text-muted">{catalogSearching ? "Searching…" : ""}</small></div>{catalogError && <small className="text-danger d-block">{catalogError}</small>}{!catalogSearching && !catalogError && catalogQuery.trim().length >= 2 && catalogResults.length === 0 && <div className="alert alert-light border py-2 mt-2 mb-0">No matching book found in the catalogue. You can add your copy manually.</div>}{catalogResults.length > 0 && <div className="list-group mt-2 catalog-results">{catalogResults.map((book) => <button type="button" className="list-group-item list-group-item-action d-flex align-items-center gap-2 text-start" key={book.id} onClick={() => selectCatalogBook(book)}>{book.coverUrl && <img src={book.coverUrl} alt="" style={{ width: 32, height: 44, objectFit: "cover" }} />}<span><strong>{book.title}</strong><small className="d-block text-muted">{book.author || "Unknown author"}{book.year ? ` · ${book.year}` : ""}</small></span></button>)}</div>}{catalogSelected && <div className="alert alert-success py-2 mt-2 mb-0">Book selected. Bibliographic details and cover are locked.</div>}<button type="button" className="manual-book-choice" onClick={() => { setManualMode(true); setCatalogBook(null); setCatalogQuery(""); setCatalogResults([]); }}><span className="manual-book-choice-icon" aria-hidden="true"><BookPlus size={22} strokeWidth={1.9} /></span><span><strong>Can’t find your book in the catalogue?</strong><small>Add it manually</small></span></button></div> : <div className="mb-3"><button type="button" className="btn btn-link btn-sm px-0" onClick={() => setManualMode(false)}>← Search the online catalogue instead</button></div>}
      {(manualMode || catalogBook) && <div className="book-editor-sections">
        <section className="book-editor-section">
          <h6 className="book-editor-section-title">The book</h6>
          {catalogSelected ? <div className="catalog-book-summary">
            <img src={catalogBook.coverUrl || "/images/open-book.png"} alt="" />
            <div className="min-width-0"><strong>{form.title}</strong><span>{form.author}</span><small>{form.language} · Found in Open Library</small></div>
          </div> : <>
            <div className="mb-3"><label className="form-label">Title *</label><input className="form-control" required value={form.title} onChange={(event) => update("title", event.target.value)} /></div>
            <div className="mb-3"><label className="form-label">Author *</label><input className="form-control" required value={form.author} onChange={(event) => update("author", event.target.value)} /></div>
            <div className="mb-3"><label className="form-label">Language</label><select className="form-select" value={form.language} onChange={(event) => update("language", event.target.value)}>{languages.map(([code, name]) => <option value={code} key={code}>{name} ({code})</option>)}</select></div>
          </>}
          <div className="mt-3 mb-3"><label className="form-label">Audience</label><select className="form-select" value={form.age} onChange={(event) => update("age", event.target.value)}><option value="young_children">Young children (0–6)</option><option value="children">Children (7–11)</option><option value="teenagers">Teenagers (12–17)</option><option value="adults">Adults (18+)</option></select></div>
          {manualMode && <div><label className="form-label">Cover images <span className="text-muted">(up to 2)</span></label><input ref={galleryInputRef} className="visually-hidden" type="file" accept="image/*" onChange={handleImagesChange} /><input ref={cameraInputRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={handleImagesChange} /><div className="cover-picker-row">{images.map((image, index) => <div className="cover-picker-image" key={`${image.name}-${image.lastModified}`}><img src={URL.createObjectURL(image)} alt={`Selected cover ${index + 1}`} /><button type="button" className="cover-picker-remove" onClick={() => removeImage(index)} aria-label="Remove image">×</button></div>)}{images.length < MAX_IMAGES && <button type="button" className="cover-picker-placeholder" onClick={addImage} aria-label="Add a cover image"><span>＋</span></button>}{images.length === 2 && <button type="button" className="btn btn-outline-secondary btn-sm align-self-center" onClick={swapImages}>Change order</button>}</div>{showImageChoices && <div className="image-choice-backdrop" role="dialog" aria-modal="true" aria-labelledby="image-choice-title" onClick={() => setShowImageChoices(false)}><div className="image-choice-modal" onClick={(event) => event.stopPropagation()}><h6 id="image-choice-title">Add a cover image</h6><p className="text-muted small mb-3">Choose where to get the image.</p><button type="button" className="btn btn-primary w-100 mb-2" onClick={() => chooseImageSource(cameraInputRef)}>Take a photo</button><button type="button" className="btn btn-outline-primary w-100 mb-2" onClick={() => chooseImageSource(galleryInputRef)}>Choose from gallery</button><button type="button" className="btn btn-link btn-sm" onClick={() => setShowImageChoices(false)}>Cancel</button></div></div>}<small className="text-muted d-block mt-1">Add up to two images, one at a time.</small></div>}
        </section>
        <section className="book-editor-section">
          <h6 className="book-editor-section-title">Tell readers about it</h6>
          <div className="mb-3"><label className="form-label">Summary <span className="text-muted">(optional)</span></label><textarea className="form-control" rows="3" maxLength="1500" value={form.summary} onChange={(event) => update("summary", event.target.value)} placeholder="What is this book about?" /><small className="book-field-help">{form.summary.length}/1500</small></div>
          <div><label className="form-label">Owner’s note <span className="text-muted">(optional)</span></label><textarea className="form-control" rows="2" maxLength="500" value={form.ownerComment} onChange={(event) => update("ownerComment", event.target.value)} placeholder="What did you think of it? Is there anything borrowers should know?" /><small className="book-field-help">{form.ownerComment.length}/500 · Please don’t include personal contact details.</small></div>
        </section>
        <section className="book-editor-section book-editor-sharing">
          <h6 className="book-editor-section-title">Sharing</h6>
          <div className="availability-toggle-row"><strong>{form.available ? "Available for borrowing" : "Not available for borrowing"}</strong><div className="form-check form-switch"><input className="form-check-input" type="checkbox" role="switch" checked={form.available} onChange={(event) => update("available", event.target.checked)} id="new-book-available" aria-label="Change borrowing availability" /></div></div>
          <p>{form.available ? "Other members can find this book and send you a borrowing request." : "The book remains in your library, but other members cannot request it."}</p>
        </section>
      </div>}
    </div><div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={closeAndReset} disabled={saving}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving || (!manualMode && !catalogBook)}>{saving ? "Saving…" : "Share this book"}</button></div>
  </form></div></div>;
}
