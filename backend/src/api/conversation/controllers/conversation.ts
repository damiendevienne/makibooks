// @ts-nocheck
import { factories } from '@strapi/strapi';
import { getUnreadCount, notifyUsers } from '../../../services/push';

export default factories.createCoreController('api::conversation.conversation', ({ strapi }) => ({
  async mine(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();
    const activeZone = String(ctx.query.zone || '').trim();
    await this.createDueLoanReminders(userId);
    const rows = await strapi.db.query('api::conversation.conversation').findMany({
      where: { $or: [{ participantOne: userId }, { participantTwo: userId }] },
      orderBy: { lastMessageAt: 'desc' },
      populate: { participantOne: true, participantTwo: true, loans: { populate: { book: { populate: { image: true, zone: true } }, lender: true, borrower: true } } },
    });
    const scopedRows = activeZone
      ? rows.filter((row) => (row.loans || []).some((loan) => loan.book?.zone?.slug === activeZone))
      : rows;
    const withUnread = await Promise.all(scopedRows.map(async (row) => {
      const incoming = await strapi.db.query('api::message.message').findMany({
        where: { conversation: row.id, readAt: null },
        populate: { sender: true },
      });
      const unreadMessages = incoming.filter((message) => message.sender?.id !== userId).length;
      const pendingRefusal = (row.loans || []).some((loan) => loan.status === 'refused'
        && (loan.lender?.id === userId ? !row.lenderArchivedAt : !row.borrowerArchivedAt));
      const pendingRequest = (row.loans || []).some((loan) => loan.status === 'requested' && loan.lender?.id === userId);
      const pendingCancellation = (row.loans || []).some((loan) => loan.status === 'cancelled'
        && loan.lender?.id === userId && !row.lenderArchivedAt);
      return { ...row, unreadCount: Math.max(unreadMessages, pendingRequest ? 1 : 0, pendingCancellation ? 1 : 0, pendingRefusal ? 1 : 0) };
    }));
    ctx.body = { data: withUnread.map((row) => ({
      ...row,
      participantOne: this.publicUser(row.participantOne),
      participantTwo: this.publicUser(row.participantTwo),
      loans: (row.loans || []).map((loan) => ({
        ...loan,
        lender: this.publicUser(loan.lender),
        borrower: this.publicUser(loan.borrower),
      })),
    })) };
  },

  async unreadCount(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();
    const count = await getUnreadCount(strapi, userId, String(ctx.query.zone || '').trim());
    ctx.body = { data: { count } };
  },

  async markRead(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();
    const conversation = await this.findParticipantConversation(ctx.params.id, userId);
    if (!conversation) return ctx.notFound('Conversation not found.');
    const loans = await strapi.db.query('api::loan.loan').findMany({ where: { conversation: conversation.id }, select: ['status'], populate: { lender: true } });
    const hasOpenLoan = loans.some((loan) => loan.status === 'requested' || loan.status === 'active');
    const withinGracePeriod = conversation.closedAt
      && Date.now() - new Date(conversation.closedAt).getTime() < 24 * 60 * 60 * 1000;
    const hasPendingRefusal = loans.some((loan) => loan.status === 'refused')
      && (loans.some((loan) => loan.status === 'refused' && loan.lender?.id === userId) ? !conversation.lenderArchivedAt : !conversation.borrowerArchivedAt);
    const hasPendingCancellation = loans.some((loan) => loan.status === 'cancelled')
      && (loans.some((loan) => loan.status === 'cancelled' && loan.lender?.id === userId) ? !conversation.lenderArchivedAt : !conversation.borrowerArchivedAt);
    if (conversation.closedAt && loans.length && !hasOpenLoan && !withinGracePeriod && !hasPendingRefusal && !hasPendingCancellation) {
      return ctx.badRequest('This discussion is archived because the loan ended more than 24 hours ago.');
    }
    const unread = await strapi.db.query('api::message.message').findMany({
      where: { conversation: conversation.id, readAt: null }, populate: { sender: true },
    });
    await Promise.all(unread.filter((item) => item.sender?.id !== userId).map((message) => strapi.db.query('api::message.message').update({ where: { id: message.id }, data: { readAt: new Date() } })));
    ctx.body = { data: { ok: true } };
  },

  async archive(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();
    const conversation = await this.findParticipantConversation(ctx.params.id, userId);
    if (!conversation) return ctx.notFound('Conversation not found.');
    const loan = await strapi.db.query('api::loan.loan').findOne({
      where: { conversation: conversation.id }, populate: { lender: true },
    });
    if (!loan) return ctx.badRequest('This conversation has no associated loan.');
    const field = loan.lender?.id === userId ? 'lenderArchivedAt' : 'borrowerArchivedAt';
    const updated = await strapi.db.query('api::conversation.conversation').update({
      where: { id: conversation.id }, data: { [field]: new Date() },
    });
    // Archiving is the user's explicit acknowledgement of the final system
    // notice. Do not leave that incoming message counted as unread in badges.
    const unread = await strapi.db.query('api::message.message').findMany({
      where: { conversation: conversation.id, readAt: null }, populate: { sender: true },
    });
    for (const message of unread.filter((item) => item.sender?.id !== userId)) {
      await strapi.db.query('api::message.message').update({ where: { id: message.id }, data: { readAt: new Date() } });
    }
    ctx.body = { data: { archived: true, conversation: updated } };
  },

  async messages(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();
    const conversation = await this.findParticipantConversation(ctx.params.id, userId);
    if (!conversation) return ctx.notFound('Conversation not found.');
    await this.createDueLoanReminders(userId);
    const rows = await strapi.db.query('api::message.message').findMany({
      where: { conversation: conversation.id },
      orderBy: { createdAt: 'asc' },
      populate: { sender: true },
    });
    ctx.body = { data: rows.map((row) => ({ ...row, sender: this.publicUser(row.sender) })) };
  },

  async send(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();
    const conversation = await this.findParticipantConversation(ctx.params.id, userId);
    if (!conversation) return ctx.notFound('Conversation not found.');
    const content = String(ctx.request.body?.content || '').trim();
    if (!content) return ctx.badRequest('Message content is required.');
    const purpose = ctx.request.body?.purpose === 'returnArrangement' ? 'returnArrangement' : 'chat';
    const message = await strapi.db.query('api::message.message').create({
      data: { conversation: conversation.id, sender: userId, content, isSystem: false, purpose },
      populate: { sender: true },
    });
    await strapi.db.query('api::conversation.conversation').update({
      where: { id: conversation.id }, data: { lastMessageAt: new Date() },
    });
    const recipientId = conversation.participantOne?.id === userId ? conversation.participantTwo?.id : conversation.participantOne?.id;
    notifyUsers(strapi, [recipientId], { title: `Message from ${ctx.state.user?.username || 'a reader'}`, body: content, conversationId: conversation.documentId || conversation.id })
      .catch((error) => strapi.log.warn(`Unable to send conversation push notification: ${error.message}`));
    ctx.body = { data: { ...message, sender: this.publicUser(message.sender) } };
  },

  async findParticipantConversation(identifier, userId) {
    const where = /^\d+$/.test(String(identifier)) ? { id: Number(identifier) } : { documentId: identifier };
    return strapi.db.query('api::conversation.conversation').findOne({
      where: { ...where, $or: [{ participantOne: userId }, { participantTwo: userId }] },
      populate: { participantOne: true, participantTwo: true },
    });
  },

  async createDueLoanReminders(userId) {
    const loans = await strapi.db.query('api::loan.loan').findMany({
      where: { borrower: userId, status: 'active', borrowerReceivedAt: { $notNull: true } },
      populate: { book: true, borrower: true, lender: true, conversation: true },
    });
    const now = new Date();
    for (const loan of loans) {
      const receivedAt = new Date(loan.borrowerReceivedAt);
      const elapsedDays = Math.floor((now.getTime() - receivedAt.getTime()) / 86400000);
      const lastReminderAt = loan.lastLoanReminderAt ? new Date(loan.lastLoanReminderAt) : null;
      const reminderDue = elapsedDays >= 21 && (!lastReminderAt || now.getTime() - lastReminderAt.getTime() >= 7 * 86400000);
      if (!reminderDue || !loan.conversation?.id || !loan.book) continue;
      const weeks = Math.floor(elapsedDays / 7);
      const content = weeks === 3
        ? `Loan reminder: you have had “${loan.book.title}” for three weeks. A one-month loan is usually a good lending period. We’ll remind you again next week if the book has not been returned.`
        : `Loan reminder: you have had “${loan.book.title}” for ${weeks} weeks. Please arrange its return with the owner when you are finished. We’ll remind you again next week if needed.`;
      // The list and the open discussion can be requested at the same time.
      // Check the exact reminder text first so that concurrent requests cannot
      // create the same weekly reminder twice.
      const existingReminder = await strapi.db.query('api::message.message').findOne({
        where: { conversation: loan.conversation.id, content },
      });
      if (existingReminder) {
        await strapi.db.query('api::loan.loan').update({ where: { id: loan.id }, data: { lastLoanReminderAt: now } });
        continue;
      }
      await strapi.db.query('api::message.message').create({
        data: { conversation: loan.conversation.id, sender: loan.lender.id, content, isSystem: true },
      });
      await strapi.db.query('api::conversation.conversation').update({ where: { id: loan.conversation.id }, data: { lastMessageAt: now } });
      await strapi.db.query('api::loan.loan').update({ where: { id: loan.id }, data: { lastLoanReminderAt: now } });
      await notifyUsers(strapi, [userId], { title: 'Loan reminder', body: content, conversationId: loan.conversation.documentId || loan.conversation.id });
    }
  },

  publicUser(user) {
    if (!user) return null;
    return { id: user.id, documentId: user.documentId, username: user.username };
  },
}));
