const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

export default {
  async send(ctx) {
    const user = ctx.state.user;
    const message = String(ctx.request.body?.message || '').trim();
    if (!message) return ctx.badRequest('Please write a message.');
    if (message.length > 3000) return ctx.badRequest('Your message cannot exceed 3000 characters.');
    const username = String(user.username || 'Unknown user');
    const email = String(user.email || 'No email provided');
    const recipient = process.env.FEEDBACK_RECIPIENT || 'noreply@makibooks.org';
    await strapi.plugin('email').service('email').send({
      to: recipient,
      subject: `Maki Books feedback from ${username}`,
      text: `Maki Books feedback\n\nFrom: ${username}\nEmail: ${email}\n\nMessage:\n${message}`,
      html: `<div style="font-family:Arial,sans-serif;color:#263746;line-height:1.5"><h2 style="color:#315a73;margin:0 0 1rem">Maki Books feedback</h2><p><strong>From:</strong> ${escapeHtml(username)}<br><strong>Email:</strong> ${escapeHtml(email)}</p><hr style="border:0;border-top:1px solid #d9e1e5;margin:1.25rem 0"><h3 style="font-size:1rem;color:#315a73;margin-bottom:.5rem">Message</h3><p style="white-space:pre-wrap;margin-top:0">${escapeHtml(message)}</p></div>`,
    });
    ctx.body = { data: { sent: true } };
  },
};
