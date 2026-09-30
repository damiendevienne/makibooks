import { runDailyActivityDigest } from '../src/services/dailyDigest';

export default {
  dailyActivityDigest: {
    task: async ({ strapi }) => {
      strapi.log.info('Daily activity digest started.');
      try {
        const results = await runDailyActivityDigest(strapi);
        strapi.log.info(`Daily activity digest finished: ${results.length} user(s) received a digest.`);
      } catch (error) {
        strapi.log.error(`Daily activity digest failed: ${error.message}`);
      }
    },
    options: {
      rule: '0 20 * * *',
      tz: 'Europe/Athens',
    },
  },
};
