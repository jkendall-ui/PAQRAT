/**
 * API base URL helper.
 *
 * In development, Vite's proxy handles /api → localhost:3000.
 * In production, VITE_API_URL points to the Railway server.
 */
const API_BASE = import.meta.env.VITE_API_URL ?? '';

export function apiUrl(path: string): string {
  // path should start with /api/...
  return `${API_BASE}${path}`;
}
