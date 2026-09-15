export default { routes: [
  { method: 'PUT', path: '/profile', handler: 'profile.update', config: { auth: {} } },
  { method: 'GET', path: '/email/unsubscribe', handler: 'profile.unsubscribe', config: { auth: false } },
] };
