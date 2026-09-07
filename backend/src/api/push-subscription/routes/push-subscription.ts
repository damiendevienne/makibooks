export default {
  routes: [
    { method: 'POST', path: '/push-subscriptions', handler: 'push-subscription.subscribe', config: { auth: { scope: [] } } },
    { method: 'POST', path: '/push-subscriptions/unsubscribe', handler: 'push-subscription.unsubscribe', config: { auth: { scope: [] } } },
    { method: 'DELETE', path: '/push-subscriptions', handler: 'push-subscription.unsubscribe', config: { auth: { scope: [] } } },
  ],
};
