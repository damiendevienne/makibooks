type Activity = {
  type: 'request' | 'message' | 'update';
  bookTitle?: string;
  username?: string;
  text?: string;
};

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const activityLabel = (type: Activity['type']) => type === 'request' ? 'new request' : type === 'message' ? 'new message' : 'update';

export const buildDailyActivitySubject = (activities: Activity[]) => {
  const counts = activities.reduce<Record<string, number>>((result, activity) => {
    result[activity.type] = (result[activity.type] || 0) + 1;
    return result;
  }, {});
  const types = Object.keys(counts) as Activity['type'][];
  if (types.length === 1) {
    const type = types[0];
    const count = counts[type];
    return `Maki Books today: ${count} ${activityLabel(type)}${count === 1 ? '' : 's'}`;
  }
  return `Maki Books today: ${activities.length} updates`;
};

export const buildDailyActivityEmail = (username: string, activities: Activity[], appUrl: string) => {
  const requests = activities.filter((activity) => activity.type === 'request');
  const messages = activities.filter((activity) => activity.type === 'message');
  const updates = activities.filter((activity) => activity.type === 'update');
  const sections = [
    requests.length ? { title: 'Borrowing requests', items: requests.map((item) => `${item.username || 'Someone'} requested to borrow “${item.bookTitle || 'a book'}”.`) } : null,
    messages.length ? { title: 'Messages', items: [`You received ${messages.length} new message${messages.length === 1 ? '' : 's'}.`] } : null,
    updates.length ? { title: 'Updates', items: updates.map((item) => item.text || `There is an update about “${item.bookTitle || 'a book'}”.`) } : null,
  ].filter(Boolean) as { title: string; items: string[] }[];
  const plainSections = sections.flatMap((section) => [section.title, ...section.items, '']);
  const htmlSections = sections.map((section) => `<h3 style="color:#315a73;margin:1.25rem 0 .4rem">${escapeHtml(section.title)}</h3><ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`).join('');
  const unsubscribeUrl = `${appUrl.replace(/\/$/, '')}/unsubscribe-email`;
  return {
    subject: buildDailyActivitySubject(activities),
    text: `Hello ${username},\n\nThere was activity on your Maki Books account today.\n\n${plainSections.join('\n')}\nOpen Maki Books to view the full activity: ${appUrl}\n\nWe only send emails when there is activity on your account.\nUnsubscribe from Maki Books emails: ${unsubscribeUrl}`,
    html: `<div style="font-family:Arial,sans-serif;color:#263746;line-height:1.5"><p>Hello ${escapeHtml(username)},</p><p>There was activity on your Maki Books account today.</p>${htmlSections}<p><a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:12px 18px;background:#6bb5f3;color:#111;text-decoration:none;border-radius:6px;font-weight:600">Open Maki Books</a></p><p style="font-size:.85rem;color:#6c757d">We only send emails when there is activity on your account.</p><p style="font-size:.85rem;color:#6c757d"><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe from Maki Books emails</a></p></div>`,
  };
};
