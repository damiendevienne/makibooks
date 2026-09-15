import { runDailyActivityDigest } from '../src/services/dailyDigest';

export default {
  dailyActivityDigest: {
    task: async ({ strapi }) => {
      try {
        const results = await runDailyActivityDigest(strapi);
        if (results.length) strapi.log.info(`Daily activity digest sent to ${results.length} user(s).`);
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
