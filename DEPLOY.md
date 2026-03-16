# Deployment Guide — PA Exam Prep

## Architecture

- **Frontend**: Vercel (React SPA via Vite)
- **Backend**: Railway (Express + Prisma)
- **Database**: Railway PostgreSQL add-on
- **Media**: Vercel Blob (optional)

---

## Step 1: Push to GitHub

Make sure your repo is pushed to GitHub (Railway and Vercel both deploy from Git).

```bash
git add -A
git commit -m "Prepare for production deployment"
git push origin main
```

---

## Step 2: Deploy Backend on Railway

### 2a. Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in
2. Click **New Project** → **Deploy from GitHub Repo**
3. Select your repo
4. Railway will detect the `server/` directory — set the **Root Directory** to `server`

### 2b. Add PostgreSQL

1. In your Railway project, click **+ New** → **Database** → **PostgreSQL**
2. Railway auto-provisions the DB and sets `DATABASE_URL` in the service env

### 2c. Set Environment Variables

In the Railway service settings → **Variables**, add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | *(auto-set by Railway Postgres add-on)* |
| `GOOGLE_CLIENT_ID` | Your Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Your Google OAuth client secret |
| `JWT_SECRET` | A strong random string (32+ chars) |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `FRONTEND_URL` | `https://your-app.vercel.app` (set after Vercel deploy) |
| `SERVER_URL` | `https://your-server.up.railway.app` (Railway gives you this) |

### 2d. Deploy

Railway auto-deploys on push. The `railway.toml` configures:
- Dockerfile build
- Start command: `prisma migrate deploy && node dist/index.js`
- Health check at `/api/health`

### 2e. Seed the Database

After the first deploy, open the Railway shell and run:

```bash
npx prisma db seed
npx tsx prisma/seedEcgData.ts
```

Or connect to the Railway Postgres from your local machine and seed locally:

```bash
DATABASE_URL="postgresql://..." npx prisma db seed
DATABASE_URL="postgresql://..." npx tsx prisma/seedEcgData.ts
```

---

## Step 3: Deploy Frontend on Vercel

### 3a. Import Project

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **Add New** → **Project** → Import your GitHub repo
3. Set **Root Directory** to `client`
4. Framework preset: **Vite** (auto-detected)

### 3b. Set Environment Variables

In Vercel project settings → **Environment Variables**, add:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://your-server.up.railway.app` (your Railway URL) |
| `VITE_GOOGLE_CLIENT_ID` | Your Google OAuth client ID |

### 3c. Deploy

Vercel auto-deploys on push. The `vercel.json` configures SPA routing.

---

## Step 4: Update Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Edit your OAuth 2.0 Client ID
3. Add to **Authorized redirect URIs**:
   ```
   https://your-server.up.railway.app/api/auth/callback
   ```
4. Add to **Authorized JavaScript origins**:
   ```
   https://your-app.vercel.app
   ```

---

## Step 5: Cross-link URLs

After both are deployed:

1. **Railway**: Set `FRONTEND_URL` to your Vercel URL (e.g., `https://pa-exam-prep.vercel.app`)
2. **Railway**: Set `SERVER_URL` to your Railway URL (e.g., `https://pa-exam-prep-server.up.railway.app`)
3. **Vercel**: Set `VITE_API_URL` to your Railway URL
4. Redeploy both services to pick up the new env vars

---

## Verify

1. Visit your Vercel URL
2. Click "Sign in with Google" — should redirect to Google consent, then back to your app
3. Start a study session
4. Try ECG interpretation mode — Claude AI evaluation should work

---

## Troubleshooting

- **CORS errors**: Make sure `FRONTEND_URL` on Railway matches your exact Vercel domain
- **OAuth redirect mismatch**: The redirect URI in Google Console must exactly match `SERVER_URL/api/auth/callback`
- **Database connection**: Railway Postgres `DATABASE_URL` is auto-injected; check the Variables tab
- **Build fails**: Both `server/` and `client/` build independently — check root directory is set correctly
