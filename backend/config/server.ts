export default ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  url: env('PUBLIC_APP_URL', 'http://localhost:5174'),
  proxy: { koa: true },
  cron: { enabled: true },
  app: {
    keys: env.array('APP_KEYS'),
  },
});
