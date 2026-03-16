import cron from 'node-cron';
import { runEloRecalculation } from './eloRecalculation';
import { runSpacedRepetitionDecay } from './spacedRepetitionDecay';
import { runAnalyticsRollup } from './analyticsRollup';

/** Tracks the last successful run time for each cron job. */
const lastRunTimes = new Map<string, string>();

/**
 * Register all nightly cron jobs with node-cron.
 *
 * - eloRecalculation:       2:00 AM UTC
 * - spacedRepetitionDecay:  2:00 AM UTC (runs after elo)
 * - analyticsRollup:        3:00 AM UTC
 */
export function registerCronJobs(): void {
  // 2:00 AM UTC — Elo recalculation then decay
  cron.schedule('0 2 * * *', async () => {
    try {
      await runEloRecalculation();
      lastRunTimes.set('eloRecalculation', new Date().toISOString());
    } catch (err) {
      console.error('[cron] Elo recalculation failed:', err);
    }

    try {
      await runSpacedRepetitionDecay();
      lastRunTimes.set('spacedRepetitionDecay', new Date().toISOString());
    } catch (err) {
      console.error('[cron] Spaced repetition decay failed:', err);
    }
  });

  // 3:00 AM UTC — Analytics rollup
  cron.schedule('0 3 * * *', async () => {
    try {
      await runAnalyticsRollup();
      lastRunTimes.set('analyticsRollup', new Date().toISOString());
    } catch (err) {
      console.error('[cron] Analytics rollup failed:', err);
    }
  });

  console.log('[cron] All cron jobs registered');
}

/**
 * Returns the last successful run time for each cron job.
 */
export function getLastRunTimes(): Map<string, string> {
  return lastRunTimes;
}
