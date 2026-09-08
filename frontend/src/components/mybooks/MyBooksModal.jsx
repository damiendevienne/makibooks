import React, { useState, useEffect } from "react";
import BookRow from "./BookRow";
import BookActionsModal from "./BookActionsModal";
import AddBookModal from "./AddBookModal";
import api from "../../api";
import { BookOpen, ChevronRight } from "lucide-react";

export default function MyBooksModal({ show, onClose, user, onBookCreated, onBookUpdated, onOpenConversation, externalRefreshToken = 0, activeZone, activeZoneDocumentId }) {
  const [books, setBooks] = useState([]);
  const [activeBook, setActiveBook] = useState(null);
  const [showAddBook, setShowAddBook] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (show) {
      api
        .get(
          `/api/books?filters[owner][id][$eq]=${user.id}&zone=${encodeURIComponent(activeZone || "heraklion")}&page=1&pageSize=100&populate[0]=image&populate[1]=loans&populate[2]=loans.borrower`
        )
        .then((res) => {
          const booksData = res.data.data.map((item) => {
            const activeLoan = item.loans?.find((loan) => loan.status === "active");
            const pendingRequests = (item.loans || []).filter((loan) => loan.status === "requested").sort((first, second) => new Date(first.createdAt || 0) - new Date(second.createdAt || 0)).map((loan) => ({
              borrower: loan.borrower?.username || "another member",
              startedAt: loan.createdAt || loan.updatedAt || null,
              conversationId: loan.conversation?.documentId || loan.conversation?.id || null,
            }));
            const firstImage =
              item.image?.[0]?.formats?.small?.url ||
              item.image?.[0]?.formats?.medium?.url ||
              item.image?.[0]?.url ||
              null;

            return {
              id: item.id,
              documentId: item.documentId,
              title: item.title,
              author: item.author,
              description: item.description,
              summary: item.summary,
              ownerComment: item.ownerComment,
              available: item.available,
              hasLoanHistory: Boolean(item.hasLoanHistory),
              lended: Boolean(activeLoan),
              lendedTo: activeLoan?.borrower?.username || null,
              loanReceived: Boolean(activeLoan?.borrowerReceivedAt),
              loanStartedAt: activeLoan?.borrowerReceivedAt || activeLoan?.lenderLentAt || activeLoan?.updatedAt || activeLoan?.createdAt || null,
              loanConversationId: activeLoan?.conversation?.documentId || activeLoan?.conversation?.id || null,
              pendingRequests,
              language: item.language,
              age: item.age,
              image: firstImage,
              images: item.image || [],
              imageRecords: item.image || [],
              catalogSource: item.catalogSource || null,
              coverUrl: item.coverUrl || null,
            };
          });
          setBooks(booksData);
          setActiveBook((current) => current ? booksData.find((book) => book.id === current.id || book.documentId === current.documentId) || null : current);
        })
        .catch((err) => console.error(err));
    }
  }, [show, user?.id, refreshToken, externalRefreshToken, activeZone]);

  if (!show) return null;

  const bookGroups = [
    { key: "lent", label: "Current loans", books: books.filter((book) => book.lended || book.pendingRequests?.length) },
    { key: "available", label: "Available", books: books.filter((book) => !book.lended && !book.pendingRequests?.length && book.available) },
    { key: "unavailable", label: "Unavailable", books: books.filter((book) => !book.lended && !book.pendingRequests?.length && !book.available) },
  ].filter((group) => group.books.length > 0);

  return (
    <div
      className="modal fade show"
      style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
      tabIndex="-1"
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-lg modal-dialog-scrollable"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content">
          <div className="modal-header">
            <div><h5 className="modal-title mb-0">My Books</h5><small className="text-muted">Your books and loan status</small></div>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
            ></button>
          </div>

          <div className="modal-body my-books-modal-body">
            <button type="button" className="add-book-trigger" onClick={() => setShowAddBook(true)}>
              <span className="add-book-trigger-icon" aria-hidden="true"><BookOpen size={23} strokeWidth={1.9} /></span>
              <span className="add-book-trigger-copy"><strong>Share a book</strong><small>For someone to discover!</small></span>
              <ChevronRight className="add-book-trigger-arrow" size={21} aria-hidden="true" />
            </button>
            {books.length === 0 && <p className="text-muted text-center mb-3">You have no books here yet. Add books from your shelf so other members can borrow them, and keep track of their lending status.</p>}

            <div className="my-books-groups">{bookGroups.map((group) => <section className={`my-books-group my-books-group-${group.key}`} key={group.key}>
              <h6>{group.label} <span>({group.books.length})</span></h6>
              <div className="my-books-list">{group.books.map((book) => <BookRow book={book} onEdit={() => setActiveBook(book)} key={book.id} />)}</div>
              </section>)}
          </div>
          </div>
        </div>
      </div>
      {activeBook && (
        <BookActionsModal
          book={activeBook}
          onClose={() => setActiveBook(null)}
          onOpenConversation={onOpenConversation}
          onUpdate={(updated, options = {}) => {
            if (!updated) {
              setBooks((current) => current.filter((item) => (
                item.id !== activeBook.id && item.documentId !== activeBook.documentId
              )));
            } else {
              // Strapi can return either the numeric id or the documentId depending
              // on the endpoint/version. Match on both and merge the response into
              // the existing row so the badge updates without closing My Books.
              setBooks((current) => current.map((item) => {
                const sameBook =
                  (updated.id != null && item.id === updated.id) ||
                  (updated.documentId && item.documentId === updated.documentId) ||
                  item.id === activeBook.id ||
                  item.documentId === activeBook.documentId;
                return sameBook ? { ...item, ...updated, available: updated.available } : item;
              }));
              // Re-read the source of truth as well, keeping the local update
              // instantaneous while guarding against stale response shapes.
              setRefreshToken((value) => value + 1);
              if (options.keepOpen) setActiveBook((current) => ({ ...current, ...updated, available: updated.available }));
            }
            onBookUpdated?.();
            if (!options.keepOpen) setActiveBook(null);
          }}
        />
      )}
      <AddBookModal
        show={showAddBook}
        onClose={() => setShowAddBook(false)}
        onCreated={(book) => {
          setRefreshToken((value) => value + 1);
          onBookCreated?.(book);
        }}
        zoneSlug={activeZone}
        zoneDocumentId={activeZoneDocumentId}
      />
    </div>
  );
}
