/**
 * Production startup script — runs Prisma migrate then starts the server.
 * Replaces start.sh to avoid shell output buffering issues on Railway.
 */
import { execSync } from 'child_process';

async function main() {
  console.log('[startup] begin');
  console.log('[startup] PORT=' + (process.env.PORT || 'not set'));
  console.log('[startup] NODE_ENV=' + (process.env.NODE_ENV || 'not set'));

  // Run Prisma migrate deploy
  try {
    console.log('[startup] running prisma migrate deploy...');
    const output = execSync('npx prisma migrate deploy', {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    console.log(output);
    console.log('[startup] migrate done');
  } catch (err: any) {
    console.error('[startup] migrate failed:', err.stderr || err.message);
    // Continue anyway — migrations may already be applied
  }

  // Now start the server
  console.log('[startup] loading server...');
  await import('./env');
  const { default: app } = await import('./app');
  const { registerCronJobs } = await import('./cron');

  const PORT = process.env.PORT || 3000;
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[startup] server listening on 0.0.0.0:${PORT}`);
    registerCronJobs();
  });
}

main().catch((err) => {
  console.error('[startup] FATAL:', err);
  process.exit(1);
});
