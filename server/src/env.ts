import dotenv from 'dotenv';
// In production (Railway), env vars are injected by the platform.
// In development, load from root .env file.
dotenv.config({ path: '../.env' });
