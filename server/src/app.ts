import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import authRouter from './routes/auth';
import sessionsRouter from './routes/sessions';
import attemptsRouter from './routes/attempts';
import progressRouter from './routes/progress';
import analyticsRouter from './routes/analytics';
import questionsRouter from './routes/questions';
import bookmarksRouter from './routes/bookmarks';
import mediaRouter from './routes/media';
import casesRouter from './routes/cases';
import adminRouter from './routes/admin';
import { errorHandler } from './middleware/errorHandler';
import { getLastRunTimes } from './cron';

const app = express();

// --- Global middleware stack ---
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Rate limiter — 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests, please try again later' } },
});
app.use(limiter);

// --- Route registration ---
// Mount all routes under /api for production parity.
// In dev, Vite proxies /api/* → server with rewrite removing /api prefix,
// so we also mount at root for backward compat.
const apiRouter = express.Router();

// Public routes
apiRouter.use('/auth', authRouter);

// Authenticated routes (auth middleware applied per-router)
apiRouter.use('/sessions', sessionsRouter);
apiRouter.use('/attempts', attemptsRouter);
apiRouter.use('/progress', progressRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/questions', questionsRouter);
apiRouter.use('/bookmarks', bookmarksRouter);
apiRouter.use('/cases', casesRouter);

// Admin routes (auth + role-check middleware applied per-router)
apiRouter.use('/admin', adminRouter);

// Media routes (mixed auth — signed URLs are authenticated, uploads are admin)
apiRouter.use(mediaRouter);

// Health check (available at both /health and /api/health)
const healthHandler: express.RequestHandler = (_req, res) => {
  const cronJobs: Record<string, string | null> = {
    eloRecalculation: null,
    spacedRepetitionDecay: null,
    analyticsRollup: null,
  };
  for (const [key, value] of getLastRunTimes()) {
    cronJobs[key] = value;
  }
  res.json({ status: 'ok', timestamp: new Date().toISOString(), cronJobs });
};
apiRouter.get('/health', healthHandler);

// Mount under /api (production) and root (dev compat)
app.use('/api', apiRouter);
app.use('/', apiRouter);

// --- Global error handler (must be last) ---
app.use(errorHandler);

export default app;
