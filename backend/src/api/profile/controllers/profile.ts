import { isValidEmailUnsubscribeToken } from '../../../services/emailUnsubscribe';

export default {
  async find(ctx) {
    const current = ctx.state.user;
    if (!current) return ctx.unauthorized();
    const user = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: current.id },
      select: ['id', 'documentId', 'username', 'email', 'firstName', 'lastName', 'confirmed', 'emailNotifications'],
    });
    if (!user) return ctx.notFound('Profile not found.');
    ctx.body = { data: { ...user, emailNotifications: user.emailNotifications !== false } };
  },
  async unsubscribe(ctx) {
    const userId = Number(ctx.query.id);
    const token = String(ctx.query.token || '');
    if (!Number.isInteger(userId) || !token) return ctx.badRequest('This unsubscribe link is invalid.');
    const user = await strapi.db.query('plugin::users-permissions.user').findOne({ where: { id: userId }, select: ['id', 'email'] });
    if (!user || !isValidEmailUnsubscribeToken(user, token)) return ctx.badRequest('This unsubscribe link is invalid.');
    await strapi.db.query('plugin::users-permissions.user').update({ where: { id: user.id }, data: { emailNotifications: false } });
    ctx.body = { data: { unsubscribed: true } };
  },
  async update(ctx) {
    const current = ctx.state.user;
    const data = ctx.request.body?.data || {};
    const username = String(data.username ?? current.username).trim();
    const email = String(data.email ?? current.email).trim().toLowerCase();
    const firstName = String(data.firstName ?? current.firstName ?? '').trim();
    const lastName = String(data.lastName ?? current.lastName ?? '').trim();
    const emailNotifications = data.emailNotifications === undefined
      ? current.emailNotifications !== false
      : Boolean(data.emailNotifications);
    if (username.length < 3 || username.length > 50) return ctx.badRequest('Username must be between 3 and 50 characters.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return ctx.badRequest('Please enter a valid email address.');
    const duplicate = await strapi.db.query('plugin::users-permissions.user').findOne({ where: { $or: [{ username }, { email }], id: { $ne: current.id } } });
    if (duplicate) return ctx.badRequest('That username or email address is already in use.');
    const emailChanged = email !== current.email;
    const updated = await strapi.plugin('users-permissions').service('user').edit(current.id, { username, email, firstName, lastName, emailNotifications, ...(emailChanged ? { confirmed: false } : {}) });
    if (emailChanged) await strapi.plugin('users-permissions').service('user').sendConfirmationEmail(updated);
    ctx.body = { data: { id: updated.id, documentId: updated.documentId, username: updated.username, email: updated.email, firstName: updated.firstName, lastName: updated.lastName, confirmed: updated.confirmed, emailNotifications: updated.emailNotifications !== false }, emailConfirmationRequired: emailChanged };
  },
};
