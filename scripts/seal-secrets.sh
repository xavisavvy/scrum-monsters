#!/usr/bin/env bash
#
# seal-secrets.sh - Helper script to create Sealed Secrets for ScrumQuest
#
# Usage:
#   ./scripts/seal-secrets.sh <environment> [controller-namespace]
#
# Examples:
#   ./scripts/seal-secrets.sh dev
#   ./scripts/seal-secrets.sh staging
#   ./scripts/seal-secrets.sh prod
#
# Prerequisites:
#   - kubeseal CLI installed
#   - kubectl configured with cluster access
#   - Sealed Secrets controller installed in cluster

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONTROLLER_NAMESPACE="${2:-kube-system}"
CONTROLLER_NAME="sealed-secrets-controller"

# Validate environment argument
if [[ $# -lt 1 ]]; then
    echo -e "${RED}Error: Environment argument required${NC}"
    echo "Usage: $0 <environment> [controller-namespace]"
    echo "Environments: dev, staging, prod"
    exit 1
fi

ENV="$1"
case "$ENV" in
    dev|staging|prod)
        ;;
    *)
        echo -e "${RED}Error: Invalid environment '$ENV'${NC}"
        echo "Valid environments: dev, staging, prod"
        exit 1
        ;;
esac

# Set namespace based on environment
NAMESPACE="scrumquest-${ENV}"
OUTPUT_DIR="${PROJECT_ROOT}/k8s/overlays/${ENV}"

echo -e "${GREEN}=== ScrumQuest Sealed Secrets Generator ===${NC}"
echo -e "Environment: ${YELLOW}${ENV}${NC}"
echo -e "Namespace: ${YELLOW}${NAMESPACE}${NC}"
echo ""

# Check for kubeseal
if ! command -v kubeseal &> /dev/null; then
    echo -e "${RED}Error: kubeseal not found${NC}"
    echo "Install kubeseal:"
    echo "  macOS:   brew install kubeseal"
    echo "  Windows: scoop install kubeseal"
    echo "  Linux:   https://github.com/bitnami-labs/sealed-secrets/releases"
    exit 1
fi

# Check for kubectl
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}Error: kubectl not found${NC}"
    exit 1
fi

# Verify sealed-secrets controller is running
echo "Checking Sealed Secrets controller..."
if ! kubectl get deployment "$CONTROLLER_NAME" -n "$CONTROLLER_NAMESPACE" &> /dev/null; then
    echo -e "${YELLOW}Warning: Sealed Secrets controller not found${NC}"
    echo "Install with: kubectl apply -k k8s/infrastructure/sealed-secrets"
    echo ""
    echo "Continuing in offline mode (fetching public key from controller)..."
fi

# Create temporary directory for secrets
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo ""
echo -e "${GREEN}Enter secret values for ${ENV} environment:${NC}"
echo "(Press Enter to skip optional values)"
echo ""

# Collect secret values
read -p "DATABASE_URL: " -s DATABASE_URL
echo ""
read -p "SESSION_SECRET: " -s SESSION_SECRET
echo ""
read -p "REDIS_URL [redis://redis-service:6379]: " REDIS_URL
REDIS_URL="${REDIS_URL:-redis://${ENV}-redis-service:6379}"
echo ""

# Optional OAuth credentials
read -p "GOOGLE_CLIENT_ID (optional): " GOOGLE_CLIENT_ID
read -p "GOOGLE_CLIENT_SECRET (optional): " -s GOOGLE_CLIENT_SECRET
echo ""
read -p "GITHUB_CLIENT_ID (optional): " GITHUB_CLIENT_ID
read -p "GITHUB_CLIENT_SECRET (optional): " -s GITHUB_CLIENT_SECRET
echo ""

# PostgreSQL credentials
echo ""
echo -e "${GREEN}PostgreSQL credentials:${NC}"
read -p "POSTGRES_USER [scrumquest]: " POSTGRES_USER
POSTGRES_USER="${POSTGRES_USER:-scrumquest}"
read -p "POSTGRES_PASSWORD: " -s POSTGRES_PASSWORD
echo ""
read -p "POSTGRES_DB [scrumquest]: " POSTGRES_DB
POSTGRES_DB="${POSTGRES_DB:-scrumquest}"

# Create app secrets YAML
cat > "${TEMP_DIR}/scrumquest-secrets.yaml" <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: scrumquest-secrets
  namespace: ${NAMESPACE}
  labels:
    app.kubernetes.io/name: scrumquest
    app.kubernetes.io/component: secrets
    app.kubernetes.io/environment: ${ENV}
type: Opaque
stringData:
  DATABASE_URL: "${DATABASE_URL}"
  SESSION_SECRET: "${SESSION_SECRET}"
  REDIS_URL: "${REDIS_URL}"
  GOOGLE_CLIENT_ID: "${GOOGLE_CLIENT_ID:-}"
  GOOGLE_CLIENT_SECRET: "${GOOGLE_CLIENT_SECRET:-}"
  GITHUB_CLIENT_ID: "${GITHUB_CLIENT_ID:-}"
  GITHUB_CLIENT_SECRET: "${GITHUB_CLIENT_SECRET:-}"
EOF

# Create postgres secrets YAML
cat > "${TEMP_DIR}/postgres-secrets.yaml" <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: postgres-secrets
  namespace: ${NAMESPACE}
  labels:
    app.kubernetes.io/name: scrumquest
    app.kubernetes.io/component: database
    app.kubernetes.io/environment: ${ENV}
type: Opaque
stringData:
  POSTGRES_USER: "${POSTGRES_USER}"
  POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}"
  POSTGRES_DB: "${POSTGRES_DB}"
EOF

echo ""
echo -e "${GREEN}Sealing secrets...${NC}"

# Seal the secrets
kubeseal \
    --controller-name="$CONTROLLER_NAME" \
    --controller-namespace="$CONTROLLER_NAMESPACE" \
    --format yaml \
    < "${TEMP_DIR}/scrumquest-secrets.yaml" \
    > "${OUTPUT_DIR}/sealed-scrumquest-secrets.yaml"

kubeseal \
    --controller-name="$CONTROLLER_NAME" \
    --controller-namespace="$CONTROLLER_NAMESPACE" \
    --format yaml \
    < "${TEMP_DIR}/postgres-secrets.yaml" \
    > "${OUTPUT_DIR}/sealed-postgres-secrets.yaml"

echo ""
echo -e "${GREEN}Success! Sealed secrets created:${NC}"
echo "  - ${OUTPUT_DIR}/sealed-scrumquest-secrets.yaml"
echo "  - ${OUTPUT_DIR}/sealed-postgres-secrets.yaml"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Add the sealed secrets to the kustomization.yaml:"
echo "   resources:"
echo "     - sealed-scrumquest-secrets.yaml"
echo "     - sealed-postgres-secrets.yaml"
echo ""
echo "2. Remove the secretGenerator from kustomization.yaml"
echo ""
echo "3. Commit the sealed secrets (they are safe to commit!):"
echo "   git add ${OUTPUT_DIR}/sealed-*.yaml"
echo "   git commit -m 'feat: add ${ENV} sealed secrets'"
echo ""
echo -e "${GREEN}Done!${NC}"
