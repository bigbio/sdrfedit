#!/bin/bash
# SDRF Editor frontend -- manual Kubernetes deployment (hh-11).
# Image is built and pushed by GitHub Actions to GHCR
# (.github/workflows/frontend-build-and-push.yml); this script only applies
# manifests to whatever cluster your current kubectl context points at.
#
# This is an ADDITIONAL deployment path alongside the existing GitHub Pages
# and SSH-to-server deployments (see .github/workflows/deploy-pages.yml and
# deploy-frontend.yml) -- it does not replace either of them.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

NAMESPACE="sdrf-editor"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

check_kubectl() {
    if ! command -v kubectl &> /dev/null; then
        echo -e "${RED}Error: kubectl is not installed${NC}"
        exit 1
    fi
}

deploy() {
    echo -e "${GREEN}Deploying SDRF Editor frontend to $(kubectl config current-context)...${NC}"
    kubectl apply -f "$SCRIPT_DIR/namespace.yaml"
    kubectl apply -f "$SCRIPT_DIR/deployment.yaml"
    kubectl apply -f "$SCRIPT_DIR/service.yaml"
    kubectl apply -f "$SCRIPT_DIR/ingress-pride-services.yaml"
    echo -e "${GREEN}Deployment applied${NC}"
}

status() {
    echo -e "${GREEN}Checking deployment status...${NC}"
    kubectl wait --for=condition=ready pod -l app=sdrf-editor -n "$NAMESPACE" --timeout=180s
    kubectl get pods -n "$NAMESPACE"
    kubectl get svc -n "$NAMESPACE"
    kubectl get ingress -n "$NAMESPACE"
}

logs() {
    kubectl logs -f deployment/sdrf-editor -n "$NAMESPACE"
}

rollout() {
    echo -e "${GREEN}Rolling out the latest image...${NC}"
    kubectl rollout restart deployment/sdrf-editor -n "$NAMESPACE"
    kubectl rollout status deployment/sdrf-editor -n "$NAMESPACE" --timeout=300s
}

usage() {
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  deploy    Apply namespace, deployment, service, ingress"
    echo "  status    Check deployment status"
    echo "  logs      Follow nginx logs"
    echo "  rollout   Restart the deployment to pick up a new image"
    echo "  help      Show this help message"
}

case "${1:-help}" in
    deploy)  check_kubectl; deploy ;;
    status)  check_kubectl; status ;;
    logs)    check_kubectl; logs ;;
    rollout) check_kubectl; rollout ;;
    help|*)  usage ;;
esac
