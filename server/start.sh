#!/bin/sh

echo "=== CONTAINER START ===" >&2
echo "PORT=${PORT:-not set}" >&2
echo "NODE_ENV=${NODE_ENV:-not set}" >&2

echo "=== PRISMA MIGRATE ===" >&2
npx prisma migrate deploy 2>&1 >&2 || echo "WARN: migrate had issues" >&2

echo "=== STARTING NODE ===" >&2
exec node dist/index.js 2>&1
