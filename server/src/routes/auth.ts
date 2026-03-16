import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const SERVER_URL = process.env.SERVER_URL || FRONTEND_URL; // In dev, Vite proxies; in prod, use actual server URL
const REDIRECT_URI = `${SERVER_URL}/api/auth/callback`;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);

/** Helper: create JWT + refresh token, set cookie, return response data */
async function issueTokens(user: { id: string; email: string; name: string; avatarUrl: string | null; role: string; plan: string }, res: Response) {
  const accessToken = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.NODE_ENV === 'production' ? '15m' : '24h' }
  );

  const refreshToken = crypto.randomBytes(40).toString('hex');
  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const session = await prisma.authSession.create({
    data: { userId: user.id, refreshTokenHash, expiresAt },
  });

  res.cookie('refreshToken', `${session.id}:${refreshToken}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });

  return {
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      plan: user.plan,
    },
  };
}

/**
 * GET /auth/google
 * Redirect to Google's OAuth 2.0 consent screen (standard authorization code flow).
 * Requirements: 1.1, 1.2
 */
router.get('/google', (_req: Request, res: Response): void => {
  const authorizeUrl = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'consent',
    redirect_uri: REDIRECT_URI,
  });
  res.redirect(authorizeUrl);
});

/**
 * GET /auth/callback
 * Exchange authorization code for tokens, upsert user, issue JWT.
 * Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 1.8
 */
router.get('/callback', async (req: Request, res: Response): Promise<void> => {
  const code = req.query.code as string | undefined;

  if (!code) {
    res.redirect(`${FRONTEND_URL}/login?error=missing_code`);
    return;
  }

  try {
    // Exchange code for tokens
    const { tokens } = await googleClient.getToken({ code, redirect_uri: REDIRECT_URI });
    googleClient.setCredentials(tokens);

    // Verify the ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.sub || !payload.email) {
      res.redirect(`${FRONTEND_URL}/login?error=invalid_token`);
      return;
    }

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name ?? '';
    const avatarUrl = payload.picture ?? null;

    // Upsert user
    const user = await prisma.user.upsert({
      where: { googleId },
      update: { name, avatarUrl },
      create: { googleId, email, name, avatarUrl, role: 'student', plan: 'free' },
    });

    if (user.isBlocked) {
      res.redirect(`${FRONTEND_URL}/login?error=account_suspended`);
      return;
    }

    const tokenData = await issueTokens(user, res);

    // Redirect to frontend with token data
    const params = new URLSearchParams({
      token: tokenData.accessToken,
      user: JSON.stringify(tokenData.user),
    });
    res.redirect(`${FRONTEND_URL}/auth/complete?${params.toString()}`);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
  }
});

/**
 * POST /auth/google (legacy — accepts ID token directly)
 * Kept for backward compatibility with tests.
 */
router.post('/google', async (req: Request, res: Response): Promise<void> => {
  const { idToken } = req.body;

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid Google ID token' } });
    return;
  }

  if (!payload || !payload.sub || !payload.email) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid Google ID token' } });
    return;
  }

  const user = await prisma.user.upsert({
    where: { googleId: payload.sub },
    update: { name: payload.name ?? '', avatarUrl: payload.picture ?? null },
    create: {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name ?? '',
      avatarUrl: payload.picture ?? null,
      role: 'student',
      plan: 'free',
    },
  });

  if (user.isBlocked) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Your account has been suspended.' } });
    return;
  }

  const tokenData = await issueTokens(user, res);
  res.status(200).json(tokenData);
});

/**
 * POST /auth/refresh
 * Validate refresh token from cookie, rotate token, return new JWT.
 * Requirements: 1.4
 */
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const cookie = req.cookies?.refreshToken;
  if (!cookie || typeof cookie !== 'string') {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing refresh token' } });
    return;
  }

  const separatorIndex = cookie.indexOf(':');
  if (separatorIndex === -1) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token format' } });
    return;
  }

  const sessionId = cookie.substring(0, separatorIndex);
  const rawToken = cookie.substring(separatorIndex + 1);

  const session = await prisma.authSession.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });

  if (!session) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid session' } });
    return;
  }

  if (session.expiresAt < new Date()) {
    await prisma.authSession.delete({ where: { id: sessionId } });
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Session expired' } });
    return;
  }

  const isValid = await bcrypt.compare(rawToken, session.refreshTokenHash);
  if (!isValid) {
    await prisma.authSession.deleteMany({ where: { userId: session.userId } });
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } });
    return;
  }

  await prisma.authSession.delete({ where: { id: sessionId } });

  const tokenData = await issueTokens(session.user, res);
  res.status(200).json({ accessToken: tokenData.accessToken });
});

/**
 * POST /auth/signout
 * Invalidate session record, clear cookie.
 * Requirements: 1.4
 */
router.post('/signout', async (req: Request, res: Response): Promise<void> => {
  const cookie = req.cookies?.refreshToken;

  if (cookie && typeof cookie === 'string') {
    const separatorIndex = cookie.indexOf(':');
    if (separatorIndex !== -1) {
      const sessionId = cookie.substring(0, separatorIndex);
      try {
        await prisma.authSession.delete({ where: { id: sessionId } });
      } catch { /* already deleted */ }
    }
  }

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });

  res.status(204).send();
});

/**
 * POST /auth/dev-login
 * Development-only bypass for local testing.
 */
router.post('/dev-login', async (req: Request, res: Response): Promise<void> => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    return;
  }

  const { role } = req.body as { role?: string };
  const isAdmin = role === 'admin';

  let user;
  if (isAdmin) {
    user = await prisma.user.findFirst({ where: { role: 'admin' } });
    if (!user) {
      user = await prisma.user.create({
        data: { googleId: 'dev-admin-' + crypto.randomUUID(), email: 'admin@dev.local', name: 'Dev Admin', role: 'admin', plan: 'pro' },
      });
    }
  } else {
    user = await prisma.user.findFirst({ where: { email: 'student@dev.local' } });
    if (!user) {
      user = await prisma.user.create({
        data: { googleId: 'dev-student-' + crypto.randomUUID(), email: 'student@dev.local', name: 'Dev Student', role: 'student', plan: 'free' },
      });
    }
  }

  const tokenData = await issueTokens(user, res);
  res.status(200).json(tokenData);
});

export default router;
