/**
 * Nightly analytics rollup job.
 *
 * Placeholder — the analytics table doesn't exist yet in the schema.
 * In the future this will aggregate daily attempt statistics per student.
 */
export async function runAnalyticsRollup(): Promise<void> {
  console.log('[cron] Analytics rollup started');
  // TODO: aggregate daily attempt statistics per student once analytics table exists
  console.log('[cron] Analytics rollup complete (placeholder — no-op)');
}
