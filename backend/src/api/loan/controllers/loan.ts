// Strapi's controller factory types only expose HTTP handlers, not private helpers.
// Runtime methods below are intentionally shared within this controller.
// @ts-nocheck
import { factories } from '@strapi/strapi';
import { notifyUsers } from '../../../services/push';
import { canTransition } from '../../../services/loanState';

const activeOrRequested = ['requested', 'active'];

const idFilter = (value: string) =>
  /^\d+$/.test(value) ? { id: Number(value) } : { documentId: value };

export default factories.createCoreController('api::loan.loan', ({ strapi }) => ({
  async status(ctx) {
    const userId = ctx.state.user?.id;
    const bookId = ctx.query.bookId;
    if (!userId) return ctx.unauthorized();
    if (!bookId) return ctx.badRequest('A book is required.');
    const book = await strapi.db.query('api::book.book').findOne({ where: { ...idFilter(String(bookId)), publishedAt: { $notNull: true } } });
    if (!book) return ctx.notFound('Book not found.');
    const loan = await strapi.db.query('api::loan.loan').findOne({
      where: { book: book.id, $or: [{ borrower: userId }, { lender: userId }], status: { $in: ['requested', 'active'] } },
      populate: { conversation: true, borrower: true, lender: true },
      orderBy: { createdAt: 'desc' },
    });
    ctx.body = { data: loan ? {
      status: loan.status,
      id: loan.documentId ?? loan.id,
      conversationId: loan.conversation?.documentId ?? loan.conversation?.id,
      borrower: loan.borrower ? { id: loan.borrower.id, username: loan.borrower.username } : null,
      lender: loan.lender ? { id: loan.lender.id, username: loan.lender.username } : null,
    } : null };
  },

  async request(ctx) {
    const borrowerId = ctx.state.user?.id;
    const { bookId } = ctx.request.body ?? {};

    if (!borrowerId) return ctx.unauthorized();
    if (!bookId) return ctx.badRequest('A book is required.');

    const book = await strapi.db.query('api::book.book').findOne({
      where: { ...idFilter(String(bookId)), publishedAt: { $notNull: true } },
      populate: { owner: true },
    });

    if (!book) return ctx.notFound('Book not found.');
    if (!book.available) return ctx.badRequest('This book is not available.');
    if (book.owner?.id === borrowerId) {
      return ctx.badRequest('You cannot borrow your own book.');
    }

    const duplicate = await strapi.db.query('api::loan.loan').findOne({
      where: {
        book: book.id,
        borrower: borrowerId,
        status: { $in: activeOrRequested },
      },
    });
    if (duplicate) return ctx.badRequest('You already have an active request for this book.');

    const lenderId = book.owner.id;
    const [participantOne, participantTwo] = [borrowerId, lenderId].sort((a, b) => a - b);
    // One conversation per borrowing request/book.
    const conversation = await strapi.db.query('api::conversation.conversation').create({
      data: { participantOne, participantTwo, lastMessageAt: new Date() },
    });

    const loan = await strapi.db.query('api::loan.loan').create({
      data: {
        book: book.id,
        lender: lenderId,
        borrower: borrowerId,
        conversation: conversation.id,
        status: 'requested',
      },
    });

    await strapi.db.query('api::message.message').create({
      data: {
        conversation: conversation.id,
        sender: borrowerId,
        content: `Borrow request for “${book.title}”.`,
        isSystem: true,
      },
    });
    await strapi.db.query('api::conversation.conversation').update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });
    const borrowerName = ctx.state.user?.username || 'A reader';
    notifyUsers(strapi, [lenderId], { title: `Message from ${borrowerName}`, body: `New borrowing request for “${book.title}”.`, conversationId: conversation.documentId || conversation.id })
      .catch((error) => strapi.log.warn(`Unable to send loan request notification: ${error.message}`));
    ctx.body = { data: { ...loan, conversationId: conversation.documentId ?? conversation.id } };
  },

  async accept(ctx) {
    const loan = await this.findLoanForParticipant(ctx);
    if (!loan) return;
    if (loan.lender.id !== ctx.state.user.id) return ctx.forbidden();
    if (!canTransition(loan.status, 'active')) return ctx.badRequest('Only pending requests can be accepted.');
    const updated = await strapi.db.query('api::loan.loan').update({ where: { id: loan.id }, data: { status: 'active' } });
    const competingRequests = await strapi.db.query('api::loan.loan').findMany({
      where: { book: loan.book.id, status: 'requested', id: { $ne: loan.id } },
      populate: { conversation: true },
    });
    for (const competingRequest of competingRequests) {
      await strapi.db.query('api::loan.loan').update({ where: { id: competingRequest.id }, data: { status: 'refused' } });
      await this.systemMessage(competingRequest, ctx.state.user.id, 'The loan request was refused because another request for this book was accepted.');
      await this.closeIfLoanCompleted(competingRequest.conversation.id);
    }
    await strapi.db.query('api::book.book').update({ where: { id: loan.book.id }, data: { available: false } });
    await this.systemMessage(loan, ctx.state.user.id, `You can now discuss and arrange a time and place for the handover of “${loan.book.title}”.`);
    ctx.body = { data: updated };
  },

  async refuse(ctx) {
    const loan = await this.findLoanForParticipant(ctx);
    if (!loan) return;
    if (loan.lender.id !== ctx.state.user.id) return ctx.forbidden();
    if (!canTransition(loan.status, 'refused')) return ctx.badRequest('Only pending requests can be refused.');

    const updated = await strapi.db.query('api::loan.loan').update({
      where: { id: loan.id },
      data: { status: 'refused' },
    });
    await this.systemMessage(loan, ctx.state.user.id, 'The loan request was refused.');
    await this.closeIfLoanCompleted(loan.conversation.id);
    ctx.body = { data: updated };
  },

  async cancel(ctx) {
    const loan = await this.findLoanForParticipant(ctx);
    if (!loan) return;
    if (loan.borrower.id !== ctx.state.user.id) return ctx.forbidden();
    if (!canTransition(loan.status, 'cancelled')) return ctx.badRequest('This loan can no longer be cancelled.');
    if (loan.status === 'active' && loan.borrowerReceivedAt) {
      return ctx.badRequest('This loan has already been received. Please arrange its return instead.');
    }
    const updated = await strapi.db.query('api::loan.loan').update({ where: { id: loan.id }, data: { status: 'cancelled' } });
    const message = loan.status === 'active'
      ? 'The loan was cancelled by the borrower after acceptance.'
      : 'The borrowing request was cancelled by the borrower.';
    await this.systemMessage(loan, ctx.state.user.id, message);
    await strapi.db.query('api::book.book').update({ where: { id: loan.book.id }, data: { available: true } });
    // The borrower has completed their side. Keep the lender's side active
    // until they acknowledge the cancellation with OK.
    await strapi.db.query('api::conversation.conversation').update({
      where: { id: loan.conversation.id }, data: { borrowerArchivedAt: new Date() },
    });
    ctx.body = { data: updated };
  },

  async confirmReceived(ctx) {
    const loan = await this.findLoanForParticipant(ctx);
    if (!loan) return;
    if (loan.borrower.id !== ctx.state.user.id) return ctx.forbidden();
    if (loan.status !== 'active') return ctx.badRequest('This loan cannot be confirmed as received.');

    await strapi.db.query('api::loan.loan').update({
      where: { id: loan.id }, data: { borrowerReceivedAt: new Date() },
    });
    await this.systemMessage(loan, ctx.state.user.id, 'The borrower confirmed receiving the book.');
    ctx.body = { data: await this.activateIfConfirmed(loan.id) };
  },

  async confirmLent(ctx) {
    const loan = await this.findLoanForParticipant(ctx);
    if (!loan) return;
    if (loan.lender.id !== ctx.state.user.id) return ctx.forbidden();
    if (loan.status !== 'requested') return ctx.badRequest('This loan cannot be confirmed as lent.');

    await strapi.db.query('api::loan.loan').update({
      where: { id: loan.id }, data: { lenderLentAt: new Date() },
    });
    await this.systemMessage(loan, ctx.state.user.id, 'The lender confirmed lending the book.');
    ctx.body = { data: await this.activateIfConfirmed(loan.id) };
  },

  async confirmReturned(ctx) {
    const loan = await this.findLoanForParticipant(ctx);
    if (!loan) return;
    if (loan.borrower.id !== ctx.state.user.id) return ctx.forbidden();
    return ctx.badRequest('The borrower confirms receiving the book; the owner confirms when it is returned.');
  },

  async confirmReceivedBack(ctx) {
    const loan = await this.findLoanForParticipant(ctx);
    if (!loan) return;
    if (loan.lender.id !== ctx.state.user.id) return ctx.forbidden();
    if (!canTransition(loan.status, 'returned') || !loan.borrowerReceivedAt) return ctx.badRequest('Wait until the borrower has confirmed receiving the book.');

    const updated = await strapi.db.query('api::loan.loan').update({
      where: { id: loan.id }, data: { lenderReceivedBackAt: new Date(), status: 'returned' },
    });
    await strapi.db.query('api::book.book').update({ where: { id: loan.book.id }, data: { available: true } });
    await this.systemMessage(loan, ctx.state.user.id, `You recovered your book “${loan.book.title}”. It is available again for other readers.`);
    await this.closeIfLoanCompleted(loan.conversation.id);
    ctx.body = { data: updated };
  },

  async findLoanForParticipant(ctx) {
    if (!ctx.state.user?.id) {
      ctx.unauthorized();
      return null;
    }
    const loan = await strapi.db.query('api::loan.loan').findOne({
      where: idFilter(String(ctx.params.id)),
      populate: { lender: true, borrower: true, book: true, conversation: true },
    });
    if (!loan) {
      ctx.notFound('Loan not found.');
      return null;
    }
    if (![loan.lender.id, loan.borrower.id].includes(ctx.state.user.id)) {
      ctx.forbidden();
      return null;
    }
    return loan;
  },

  async activateIfConfirmed(loanId) {
    const loan = await strapi.db.query('api::loan.loan').findOne({
      where: { id: loanId }, populate: { book: true },
    });
    if (loan.borrowerReceivedAt && loan.lenderLentAt) {
      await strapi.db.query('api::book.book').update({ where: { id: loan.book.id }, data: { available: false } });
      if (canTransition(loan.status, 'active')) return strapi.db.query('api::loan.loan').update({ where: { id: loan.id }, data: { status: 'active' } });
    }
    return loan;
  },

  async completeIfConfirmed(loanId) {
    const loan = await strapi.db.query('api::loan.loan').findOne({
      where: { id: loanId }, populate: { book: true },
    });
    if (loan.borrowerReturnedAt && loan.lenderReceivedBackAt) {
      await strapi.db.query('api::book.book').update({ where: { id: loan.book.id }, data: { available: true } });
      return strapi.db.query('api::loan.loan').update({ where: { id: loan.id }, data: { status: 'returned' } });
    }
    return loan;
  },

  async systemMessage(loan, sender, content) {
    await strapi.db.query('api::message.message').create({
      data: { conversation: loan.conversation.id, sender, content, isSystem: true },
    });
    await strapi.db.query('api::conversation.conversation').update({
      where: { id: loan.conversation.id }, data: { lastMessageAt: new Date() },
    });
    const recipientId = loan.lender?.id === sender ? loan.borrower?.id : loan.lender?.id;
    const senderName = loan.lender?.id === sender ? loan.lender?.username : loan.borrower?.username;
    // Push delivery must not hold up the loan action or message response. The
    // discussion is already persisted and the recipient will see it on refresh.
    notifyUsers(strapi, [recipientId], { title: `Message from ${senderName || 'a reader'}`, body: content, conversationId: loan.conversation.documentId || loan.conversation.id })
      .catch((error) => strapi.log.warn(`Unable to send loan push notification: ${error.message}`));
  },

  async closeIfLoanCompleted(conversationId) {
    const loans = await strapi.db.query('api::loan.loan').findMany({ where: { conversation: conversationId }, select: ['status'] });
    if (!loans.length || loans.some((item) => item.status === 'requested' || item.status === 'active')) return;
    await strapi.db.query('api::conversation.conversation').update({ where: { id: conversationId }, data: { closedAt: new Date() } });
  },
}));
