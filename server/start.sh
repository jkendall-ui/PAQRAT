#!/bin/sh
echo "=== CONTAINER START ==="
echo "date: $(date)"
echo "PORT=${PORT:-not set}"
echo "NODE_ENV=${NODE_ENV:-not set}"
echo "node: $(node --version 2>&1 || echo MISSING)"
echo "pwd: $(pwd)"
echo "ls dist/: $(ls dist/ 2>&1)"

echo "=== PRISMA MIGRATE ==="
npx prisma migrate deploy 2>&1 || echo "WARN: migrate had issues"

echo "=== MODULE CHECK ==="
node -e "require('bcryptjs'); console.log('bcryptjs OK')" 2>&1
node -e "require('@prisma/client'); console.log('prisma OK')" 2>&1
node -e "require('express'); console.log('express OK')" 2>&1

echo "=== STARTING NODE ==="
exec node dist/index.js
