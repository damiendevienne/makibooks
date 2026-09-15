export default { routes: [
  { method: 'GET', path: '/profile', handler: 'profile.find', config: { auth: { scope: [] } } },
  { method: 'PUT', path: '/profile', handler: 'profile.update', config: { auth: {} } },
  { method: 'GET', path: '/email/unsubscribe', handler: 'profile.unsubscribe', config: { auth: false } },
] };
