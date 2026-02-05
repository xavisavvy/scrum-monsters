#!/bin/bash
set -e

echo "🚀 ScrumQuest Bootstrap"
echo "======================"

# Check for .env file
if [ ! -f .env ]; then
  echo "📝 Creating .env file with defaults..."
  cat > .env << 'EOF'
DATABASE_URL=postgresql://scrumquest:scrumquest@localhost:5433/scrumquest
SESSION_SECRET=dev-session-secret-change-in-production
EOF
  echo "   ✓ .env created"
else
  echo "   ✓ .env already exists"
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker and try again."
  exit 1
fi
echo "   ✓ Docker is running"

# Start PostgreSQL and wait for healthcheck
echo "🐘 Starting PostgreSQL..."
docker compose up -d --wait postgres
if [ $? -ne 0 ]; then
  echo "❌ PostgreSQL failed to start. Check 'docker compose logs postgres'"
  exit 1
fi
echo "   ✓ PostgreSQL ready"

# Push database schema
echo "📊 Pushing database schema..."
npm run db:push
echo "   ✓ Schema pushed"

echo ""
echo "✅ Bootstrap complete!"
echo ""
echo "Run 'npm run dev' to start the development server."
