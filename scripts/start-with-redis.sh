#!/bin/bash

# Start Redis server in the background
echo "🔴 Starting Redis server..."
redis-server --bind 127.0.0.1 --daemonize yes --loglevel warning

# Wait for Redis to be ready
sleep 1

# Check if Redis is running
if redis-cli ping > /dev/null 2>&1; then
  echo "✅ Redis server started successfully"
else
  echo "⚠️  Redis failed to start - app will run without cache"
fi

# Start the Node.js application
exec npm run dev
