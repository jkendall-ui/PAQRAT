#!/bin/sh
set -e

echo "=== PA Exam Prep Server Starting ==="
echo "DATABASE_URL is set: $(test -n "$DATABASE_URL" && echo 'yes' || echo 'NO')"
echo "GOOGLE_CLIENT_ID is set: $(test -n "$GOOGLE_CLIENT_ID" && echo 'yes' || echo 'NO')"
echo "JWT_SECRET is set: $(test -n "$JWT_SECRET" && echo 'yes' || echo 'NO')"
echo "PORT: ${PORT:-3000}"
echo "NODE_ENV: $NODE_ENV"

echo "Running prisma migrate deploy..."
npx prisma migrate deploy 2>&1 || echo "WARNING: migrate failed but continuing..."

echo "=== Starting node server ==="
exec node dist/index.js
