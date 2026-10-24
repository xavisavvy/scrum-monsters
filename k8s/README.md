# Kubernetes Deployment

Deploy Scrum Monsters to Kubernetes with environment-specific overlays and GitOps support.

> **Note:** Kubernetes namespaces, resources, hostnames, and image names below still use the legacy `scrummonsters` identifier (cluster-internal — not a user-facing brand name). They will be renamed in a future infrastructure migration.

## Prerequisites

- Docker
- Kubernetes cluster (minikube, kind, k3s, Docker Desktop)
- kubectl
- kustomize (or kubectl with kustomize support)

## Directory Structure

```
k8s/
  base/                    # Shared base manifests
    kustomization.yaml
    namespace.yaml
    configmap.yaml
    deployment.yaml
    service.yaml
    ingress.yaml
    hpa.yaml
    postgres.yaml
    redis.yaml
  overlays/
    dev/                   # Development environment
      kustomization.yaml
      patches/
    staging/               # Staging environment
      kustomization.yaml
      patches/
    prod/                  # Production environment
      kustomization.yaml
      patches/
  infrastructure/
    sealed-secrets/        # Bitnami Sealed Secrets controller
    cert-manager/          # TLS certificate management
    monitoring/            # Prometheus + Grafana + Loki
    argocd/                # GitOps deployment
  argocd-apps/             # ArgoCD Application CRDs
```

## Quick Start

### 1. Start Local Cluster

**Minikube:**
```bash
minikube start --cpus=4 --memory=4096
minikube addons enable ingress
```

**Kind:**
```bash
kind create cluster --name scrummonsters
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

**Docker Desktop:**
Enable Kubernetes in Docker Desktop settings, then:
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml
```

### 2. Build Docker Image

```bash
# From project root
docker build -t scrummonsters:latest .

# For minikube
minikube image load scrummonsters:latest

# For kind
kind load docker-image scrummonsters:latest --name scrummonsters
```

### 3. Deploy to Environment

```bash
# Development (single replica, debug logging)
kubectl apply -k k8s/overlays/dev

# Staging (2 replicas, TLS with staging certs)
kubectl apply -k k8s/overlays/staging

# Production (3+ replicas, production TLS, rate limiting)
kubectl apply -k k8s/overlays/prod
```

### 4. Add Host Entry

Add to `/etc/hosts` (Linux/Mac) or `C:\Windows\System32\drivers\etc\hosts` (Windows):

```
127.0.0.1 scrummonsters-dev.local
127.0.0.1 staging.scrummonsters.local
127.0.0.1 scrummonsters.local
```

For minikube:
```bash
echo "$(minikube ip) scrummonsters-dev.local" | sudo tee -a /etc/hosts
```

### 5. Access the App

- Development: http://scrummonsters-dev.local
- Staging: https://staging.scrummonsters.local
- Production: https://scrummonsters.local

## Infrastructure Setup

### Sealed Secrets (Required for staging/prod)

```bash
# Install Sealed Secrets controller
kubectl apply -k k8s/infrastructure/sealed-secrets

# Install kubeseal CLI
brew install kubeseal  # macOS
# or download from https://github.com/bitnami-labs/sealed-secrets/releases

# Create sealed secrets for an environment
./scripts/seal-secrets.sh prod
```

### cert-manager (Required for TLS)

```bash
# Install cert-manager
kubectl apply -k k8s/infrastructure/cert-manager

# Wait for webhooks to be ready
kubectl wait --for=condition=Available deployment/cert-manager -n cert-manager --timeout=60s
kubectl wait --for=condition=Available deployment/cert-manager-webhook -n cert-manager --timeout=60s
```

### Monitoring Stack

```bash
# Install Prometheus, Grafana, and Loki
kubectl apply -k k8s/infrastructure/monitoring

# Access Grafana
kubectl port-forward svc/grafana 3000:80 -n monitoring
# Open http://localhost:3000

# Access Prometheus
kubectl port-forward svc/prometheus 9090:9090 -n monitoring
# Open http://localhost:9090
```

### ArgoCD (GitOps)

```bash
# Install ArgoCD
kubectl apply -k k8s/infrastructure/argocd

# Get initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# Access ArgoCD UI
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Open https://localhost:8080

# Deploy applications
kubectl apply -f k8s/argocd-apps/scrummonsters-dev.yaml   # Auto-syncs from main
kubectl apply -f k8s/argocd-apps/scrummonsters-prod.yaml  # Manual sync required
```

## Environment Differences

| Feature | Dev | Staging | Prod |
|---------|-----|---------|------|
| Replicas | 1 | 2 | 3+ |
| HPA Max | 2 | 10 | 20 |
| Log Level | debug | info | warn |
| TLS | Self-signed | Let's Encrypt Staging | Let's Encrypt Prod |
| Auto-sync | Yes | Yes | No (manual) |
| Resources | Minimal | Standard | High |

## Useful Commands

```bash
# Check pod status
kubectl get pods -n scrummonsters-dev

# View logs (structured JSON in prod)
kubectl logs -n scrummonsters-dev -l app=scrummonsters -f

# Check services
kubectl get svc -n scrummonsters-dev

# Describe deployment
kubectl describe deployment dev-scrummonsters -n scrummonsters-dev

# Scale manually (overrides HPA temporarily)
kubectl scale deployment dev-scrummonsters -n scrummonsters-dev --replicas=3

# Port forward (bypass ingress)
kubectl port-forward -n scrummonsters-dev svc/dev-scrummonsters-service 5000:80

# Access PostgreSQL
kubectl exec -it -n scrummonsters-dev dev-postgres-0 -- psql -U scrummonsters -d scrummonsters

# View metrics
curl http://localhost:5000/metrics

# Delete environment
kubectl delete -k k8s/overlays/dev
```

## Secrets Management

### Development
Dev uses inline secrets in kustomization.yaml (never use in production).

### Staging/Production
Use Sealed Secrets:

```bash
# 1. Create plain secret (don't commit!)
cat > /tmp/secret.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: scrummonsters-secrets
  namespace: scrummonsters-prod
stringData:
  DATABASE_URL: "postgresql://user:pass@host:5432/db"
  SESSION_SECRET: "your-secret-here"
EOF

# 2. Seal it
kubeseal --format yaml < /tmp/secret.yaml > k8s/overlays/prod/sealed-secrets.yaml

# 3. Delete plain text
rm /tmp/secret.yaml

# 4. Commit sealed secret (safe!)
git add k8s/overlays/prod/sealed-secrets.yaml
```

## Troubleshooting

### Pods not starting
```bash
kubectl describe pod -n scrummonsters-dev <pod-name>
kubectl logs -n scrummonsters-dev <pod-name> --previous
```

### Database connection issues
```bash
kubectl get pods -n scrummonsters-dev -l app=postgres
kubectl logs -n scrummonsters-dev dev-postgres-0
```

### Certificate issues
```bash
kubectl get certificates -n scrummonsters-prod
kubectl describe certificate scrummonsters-prod-tls -n scrummonsters-prod
kubectl get certificaterequest -n scrummonsters-prod
```

### ArgoCD sync issues
```bash
argocd app get scrummonsters-dev
argocd app sync scrummonsters-dev --prune
argocd app diff scrummonsters-dev
```

### WebSocket issues
- Verify ingress has WebSocket annotations
- Check sticky sessions: `nginx.ingress.kubernetes.io/affinity: "cookie"`
- Ensure service has `sessionAffinity: ClientIP`
