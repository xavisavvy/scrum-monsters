# Kubernetes Deployment

Deploy ScrumQuest to a local Kubernetes cluster.

## Prerequisites

- Docker
- Kubernetes cluster (minikube, kind, k3s, Docker Desktop, etc.)
- kubectl
- nginx-ingress controller (for ingress)

## Quick Start

### 1. Start Local Cluster

**Minikube:**
```bash
minikube start --cpus=4 --memory=4096
minikube addons enable ingress
```

**Kind:**
```bash
kind create cluster --name scrumquest
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
docker build -t scrumquest:latest .

# For minikube - load image into minikube's docker
minikube image load scrumquest:latest

# For kind
kind load docker-image scrumquest:latest --name scrumquest
```

### 3. Update Secrets

Edit `k8s/secret.yaml` and set secure values:

```bash
# Generate a secure session secret
openssl rand -base64 32
```

Replace the placeholder values for:
- `SESSION_SECRET`
- `POSTGRES_PASSWORD` (and update `DATABASE_URL` to match)
- OAuth credentials (optional)

### 4. Deploy

```bash
# Apply all resources with kustomize
kubectl apply -k k8s/

# Or apply individually
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml
```

### 5. Add Host Entry

Add to `/etc/hosts` (Linux/Mac) or `C:\Windows\System32\drivers\etc\hosts` (Windows):

```
127.0.0.1 scrumquest.local
```

For minikube:
```bash
echo "$(minikube ip) scrumquest.local" | sudo tee -a /etc/hosts
```

### 6. Access the App

Open http://scrumquest.local in your browser.

## Useful Commands

```bash
# Check pod status
kubectl get pods -n scrumquest

# View logs
kubectl logs -n scrumquest -l app=scrumquest -f

# Check services
kubectl get svc -n scrumquest

# Describe deployment
kubectl describe deployment scrumquest -n scrumquest

# Scale manually
kubectl scale deployment scrumquest -n scrumquest --replicas=3

# Port forward (bypass ingress)
kubectl port-forward -n scrumquest svc/scrumquest-service 5000:80

# Access PostgreSQL
kubectl exec -it -n scrumquest postgres-0 -- psql -U scrumquest -d scrumquest

# Delete everything
kubectl delete -k k8s/
```

## Production Considerations

1. **TLS/SSL**: Uncomment TLS sections in `ingress.yaml` and set up cert-manager
2. **Secrets**: Use external secrets management (Vault, AWS Secrets Manager, etc.)
3. **Database**: Consider managed PostgreSQL (RDS, Cloud SQL, etc.)
4. **Redis**: Consider managed Redis (ElastiCache, Memorystore, etc.)
5. **Image Registry**: Push images to a container registry (Docker Hub, GCR, ECR, etc.)
6. **Monitoring**: Add Prometheus/Grafana for metrics
7. **Logging**: Configure centralized logging (EFK stack, Loki, etc.)

## Troubleshooting

### Pods not starting
```bash
kubectl describe pod -n scrumquest <pod-name>
kubectl logs -n scrumquest <pod-name>
```

### Database connection issues
```bash
# Check if postgres is ready
kubectl get pods -n scrumquest -l app=postgres

# Check postgres logs
kubectl logs -n scrumquest postgres-0
```

### WebSocket issues
- Ensure ingress has WebSocket annotations
- Check sticky sessions are working
- Verify ingress controller supports WebSocket
