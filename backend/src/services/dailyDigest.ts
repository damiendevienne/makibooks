import { buildDailyActivityEmail } from './activityEmail';

const DAY_MS = 24 * 60 * 60 * 1000;

export const activityWindowStart = (lastSentAt: unknown, now: number) => {
  const last = lastSentAt ? new Date(String(lastSentAt)).getTime() : 0;
  return new Date(Math.max(now - DAY_MS, Number.isFinite(last) ? last : 0));
};

const addActivity = (activities: Map<number, any[]>, userId: number, activity: any) => {
  if (!userId) return;
  const current = activities.get(userId) || [];
  current.push(activity);
  activities.set(userId, current);
};

export async function runDailyActivityDigest(strapi: any, options: { now?: Date; testRecipient?: string; userId?: number } = {}) {
  const now = options.now || new Date();
  const nowMs = now.getTime();
  const users = await strapi.db.query('plugin::users-permissions.user').findMany({
    where: { emailNotifications: true, ...(options.userId ? { id: options.userId } : {}) },
    select: ['id', 'username', 'email', 'emailNotifications', 'lastActivityDigestAt'],
  });
  const activities = new Map<number, any[]>();
  const windows = new Map<number, Date>(users.map((user: any) => [user.id, activityWindowStart(user.lastActivityDigestAt, nowMs)]));
  const since = new Date(nowMs - DAY_MS);

  const loans = await strapi.db.query('api::loan.loan').findMany({
    where: { createdAt: { $gte: since, $lte: now } },
    populate: { lender: true, borrower: true, book: true },
  });
  for (const loan of loans) {
    const window = windows.get(loan.lender?.id);
    if (!window || new Date(loan.createdAt) < window) continue;
    addActivity(activities, loan.lender.id, { type: 'request', bookTitle: loan.book?.title, username: loan.borrower?.username });
  }

  const messages = await strapi.db.query('api::message.message').findMany({
    where: { createdAt: { $gte: since, $lte: now } },
    populate: {
      sender: true,
      conversation: {
        populate: {
          participantOne: true,
          participantTwo: true,
          loans: { populate: { book: true } },
        },
      },
    },
  });
  for (const message of messages) {
    const conversation = message.conversation;
    const recipient = conversation?.participantOne?.id === message.sender?.id
      ? conversation?.participantTwo
      : conversation?.participantOne;
    const window = windows.get(recipient?.id);
    if (!window || new Date(message.createdAt) < window) continue;
    const bookTitle = conversation?.loans?.find((loan: any) => loan.book)?.book?.title;
    const isSystemUpdate = Boolean(message.isSystem);
    addActivity(activities, recipient.id, isSystemUpdate
      ? { type: 'update', bookTitle, text: message.content }
      : { type: 'message', bookTitle });
  }

  const results = [];
  for (const user of users) {
    const userActivities = activities.get(user.id) || [];
    if (!userActivities.length) continue;
    const email = options.testRecipient || user.email;
    if (!email) continue;
    const content = buildDailyActivityEmail(user.username || 'there', userActivities, process.env.PUBLIC_APP_URL || 'https://makibooks.org');
    await strapi.plugin('email').service('email').send({ to: email, subject: content.subject, text: content.text, html: content.html });
    await strapi.db.query('plugin::users-permissions.user').update({ where: { id: user.id }, data: { lastActivityDigestAt: now } });
    results.push({ userId: user.id, email, activityCount: userActivities.length });
  }
  return results;
}
