import crypto from 'node:crypto';

const secret = () => String(process.env.APP_KEYS || 'maki-books-email-unsubscribe-dev-key').split(',')[0];

export const createEmailUnsubscribeToken = (user: { id: number; email: string }) => crypto
  .createHmac('sha256', secret())
  .update(`${user.id}:${user.email}`)
  .digest('hex');

export const isValidEmailUnsubscribeToken = (user: { id: number; email: string }, token: string) => {
  const expected = createEmailUnsubscribeToken(user);
  const provided = String(token || '');
  return provided.length === expected.length && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
};
