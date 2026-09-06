// import type { Core } from '@strapi/strapi';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }) {
    const existingHeraklion = await strapi.db.query('api::zone.zone').findOne({ where: { slug: 'heraklion' } });
    if (existingHeraklion && (existingHeraklion.enabled !== true || !existingHeraklion.countryCode)) {
      await strapi.db.query('api::zone.zone').update({ where: { id: existingHeraklion.id }, data: { enabled: true, countryCode: existingHeraklion.countryCode || 'GR' } });
    }
    const lyon = await strapi.db.query('api::zone.zone').findOne({ where: { slug: 'lyon' } });
    if (!lyon) {
      await strapi.db.query('api::zone.zone').create({ data: { name: 'Lyon', slug: 'lyon', countryCode: 'FR', enabled: false } });
    }
    const appUrl = process.env.PUBLIC_APP_URL || 'http://localhost:5174';
    const usersPermissionsStore = strapi.store({ type: 'plugin', name: 'users-permissions' });
    const advancedSettings = await usersPermissionsStore.get({ key: 'advanced' }) || {};
    const emailConfirmationEnabled = process.env.ENABLE_EMAIL_CONFIRMATION === 'true';
    await usersPermissionsStore.set({ key: 'advanced', value: {
      ...advancedSettings,
      email_confirmation: emailConfirmationEnabled,
      email_confirmation_redirection: `${appUrl}/email-confirmed`,
      email_reset_password: `${appUrl}/reset-password`,
    } });
    const configuredSender = process.env.EMAIL_DEFAULT_FROM;
    if (configuredSender) {
      const emailSettings = await usersPermissionsStore.get({ key: 'email' }) || {};
      for (const templateName of ['email_confirmation', 'reset_password']) {
        const template = emailSettings[templateName];
        if (!template?.options) continue;
        template.options.from = { name: 'Maki Books', email: configuredSender };
        template.options.response_email = process.env.EMAIL_DEFAULT_REPLY_TO || configuredSender;
        if (templateName === 'email_confirmation') {
          template.options.object = 'Confirm your Maki Books account';
          template.options.message = `<p>Welcome to Maki Books!</p>
<p>Please confirm your email address to activate your account.</p>
<p><a href="<%= URL %>?confirmation=<%= CODE %>" style="display:inline-block;padding:12px 18px;background:#6bb5f3;color:#111;text-decoration:none;border-radius:6px;font-weight:600">Confirm my email address</a></p>
<p>If you did not create this account, you can ignore this message.</p>
<p>Happy reading! 📚</p>`;
        } else if (templateName === 'reset_password') {
          template.options.object = 'Reset your Maki Books password';
          template.options.message = `<p>We received a request to reset your Maki Books password.</p>
<p>Your username is <strong><%= USER.username %></strong>.</p>
<p>Click the button below to choose a new password.</p>
<p><a href="<%= URL %>?code=<%= TOKEN %>" style="display:inline-block;padding:12px 18px;background:#6bb5f3;color:#111;text-decoration:none;border-radius:6px;font-weight:600">Choose a new password</a></p>
<p>If you did not request this, you can ignore this message.</p>
<p>Maki Books 📚</p>`;
        }
      }
      await usersPermissionsStore.set({ key: 'email', value: emailSettings });
    }

    // The first deployment starts with one active area. Existing books are
    // assigned to it so adding the required book.zone relation is backwards
    // compatible with the local catalogue.
    let heraklion = await strapi.db.query('api::zone.zone').findOne({ where: { slug: 'heraklion' } });
    if (!heraklion) {
      heraklion = await strapi.db.query('api::zone.zone').create({
        data: { name: 'Heraklion', slug: 'heraklion', countryCode: 'GR', enabled: true },
      });
    }
    const booksWithoutZone = await strapi.db.query('api::book.book').findMany({
      where: { zone: { $null: true } },
      select: ['id'],
    });
    for (const book of booksWithoutZone) {
      await strapi.db.query('api::book.book').update({ where: { id: book.id }, data: { zone: heraklion.id } });
    }
    // Migrate the former kids category to the current age ranges.
    const formerKidsBooks = await strapi.db.query('api::book.book').findMany({
      where: { age: 'kids' },
      select: ['id'],
    });
    for (const book of formerKidsBooks) {
      await strapi.db.query('api::book.book').update({ where: { id: book.id }, data: { age: 'young_children' } });
    }

    // Keep the authenticated API role in sync for the custom borrowing and
    // messaging routes. This also makes fresh/local databases work without a
    // manual Content Manager permission step.
    const actions = [
      'api::book.book.find', 'api::book.book.findOne',
      'api::book.book.create',
      'api::book.book.update', 'api::book.book.delete',
      'plugin::upload.content-api.upload',
      'api::loan.request', 'api::loan.status', 'api::loan.accept', 'api::loan.refuse', 'api::loan.cancel', 'api::loan.confirmReceived',
      'api::loan.confirmLent', 'api::loan.confirmReturned',
      'api::loan.confirmReceivedBack', 'api::conversation.mine',
      'api::book.catalogSearch', 'api::book.book.catalogSearch',
      'api::book.favorites', 'api::book.toggleFavorite',
      'api::book.book.favorites', 'api::book.book.toggleFavorite',
      'api::conversation.messages', 'api::conversation.send',
      'api::conversation.archive',
      // Strapi 5 may derive the scope with the API UID repeated for custom
      // controllers; keep these aliases for existing development databases.
      'api::loan.loan.request', 'api::loan.loan.status', 'api::loan.loan.accept', 'api::loan.loan.refuse', 'api::loan.loan.cancel',
      'api::loan.loan.confirmReceived', 'api::loan.loan.confirmLent',
      'api::loan.loan.confirmReturned', 'api::loan.loan.confirmReceivedBack',
      'api::conversation.conversation.mine', 'api::conversation.conversation.messages',
      'api::conversation.conversation.unreadCount',
      'api::conversation.conversation.send', 'api::conversation.markRead',
      'api::conversation.conversation.markRead',
      'api::conversation.conversation.archive', 'api::conversation.archive',
      'api::feedback.feedback.send',
      'api::profile.profile.update',
      'api::push-subscription.push-subscription.subscribe',
      'api::push-subscription.push-subscription.unsubscribe',
    ];
    const role = await strapi.db.query('plugin::users-permissions.role').findOne({
      where: { type: 'authenticated' },
    });
    if (!role) return;
    for (const action of actions) {
      const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
        where: { action }, populate: { role: true },
      });
      if (!existing || existing.role?.id !== role.id) {
        await strapi.db.query('plugin::users-permissions.permission').create({
          data: { action, role: role.id },
        });
      }
    }
    const publicRole = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'public' } });
    if (publicRole) {
      const publicActions = ['api::zone.zone.find', 'api::book.book.find', 'api::book.book.findOne'];
      for (const action of publicActions) {
        const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({ where: { action }, populate: { role: true } });
        if (!existing || existing.role?.id !== publicRole.id) {
          await strapi.db.query('plugin::users-permissions.permission').create({ data: { action, role: publicRole.id } });
        }
      }
    }
  },
};
