/**
 * Production entrypoint.
 *
 * Starts a temporary HTTP server immediately so Railway's healthcheck
 * passes while Prisma migrations run, then swaps in the real Express app.
 */
import { execSync } from 'child_process';
import http from 'http';

const PORT = Number(process.env.PORT || 3000);

const tempServer = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'starting' }));
});

tempServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[startup] healthcheck ready on :${PORT}`);
  boot().catch((err) => {
    console.error('[startup] FATAL:', err);
    process.exit(1);
  });
});

async function boot() {
  try {
    console.log('[startup] prisma migrate deploy...');
    execSync('npx prisma migrate deploy', { encoding: 'utf-8', stdio: 'inherit' });
  } catch (err: any) {
    console.error('[startup] migrate warning:', err.message);
  }

  await import('./env');
  const { default: app } = await import('./app');
  const { registerCronJobs } = await import('./cron');

  tempServer.close(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[startup] server ready on :${PORT}`);
      registerCronJobs();
    });
  });
}
