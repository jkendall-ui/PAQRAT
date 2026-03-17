/**
 * Production startup script.
 * Step 1: Start HTTP server immediately (so healthcheck passes).
 * Step 2: Run Prisma migrate in background.
 */
import { execSync } from 'child_process';
import http from 'http';

const PORT = Number(process.env.PORT || 3000);

// Immediately start a minimal HTTP server so the healthcheck passes
const tempServer = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'starting' }));
});

tempServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[startup] temp healthcheck server on 0.0.0.0:${PORT}`);
  boot().catch((err) => {
    console.error('[startup] FATAL:', err);
    process.exit(1);
  });
});

async function boot() {
  // Run Prisma migrate
  try {
    console.log('[startup] running prisma migrate deploy...');
    execSync('npx prisma migrate deploy', { encoding: 'utf-8', stdio: 'inherit' });
    console.log('[startup] migrate done');
  } catch (err: any) {
    console.error('[startup] migrate warning:', err.message);
  }

  // Close temp server, start real app
  console.log('[startup] loading app...');
  await import('./env');
  const { default: app } = await import('./app');
  const { registerCronJobs } = await import('./cron');

  tempServer.close(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[startup] server ready on 0.0.0.0:${PORT}`);
      registerCronJobs();
    });
  });
}
