#!/bin/bash
# SDRF Wizard AI Assistant backend -- manual Kubernetes deployment (hh-11).
# Image is built and pushed by GitHub Actions to GHCR
# (.github/workflows/backend-build-and-push.yml); this script only applies
# manifests to whatever cluster your current kubectl context points at.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

NAMESPACE="sdrf-assistant"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

check_kubectl() {
    if ! command -v kubectl &> /dev/null; then
        echo -e "${RED}Error: kubectl is not installed${NC}"
        exit 1
    fi
}

check_secret_file() {
    if [ ! -f "$SCRIPT_DIR/secret.yaml" ]; then
        echo -e "${RED}Error: $SCRIPT_DIR/secret.yaml not found${NC}"
        echo "Copy secret.example.yaml -> secret.yaml and fill in real API keys first."
        exit 1
    fi
}

deploy() {
    echo -e "${GREEN}Deploying SDRF Wizard AI Assistant backend to $(kubectl config current-context)...${NC}"
    kubectl apply -f "$SCRIPT_DIR/namespace.yaml"
    kubectl apply -f "$SCRIPT_DIR/configmap.yaml"
    kubectl apply -f "$SCRIPT_DIR/secret.yaml"
    kubectl apply -f "$SCRIPT_DIR/deployment.yaml"
    kubectl apply -f "$SCRIPT_DIR/service.yaml"
    kubectl apply -f "$SCRIPT_DIR/ingress-pride-services.yaml"
    echo -e "${GREEN}Deployment applied${NC}"
}

status() {
    echo -e "${GREEN}Checking deployment status...${NC}"
    kubectl wait --for=condition=ready pod -l app=sdrf-assistant -n "$NAMESPACE" --timeout=300s
    kubectl get pods -n "$NAMESPACE"
    kubectl get svc -n "$NAMESPACE"
    kubectl get ingress -n "$NAMESPACE"
}

logs() {
    kubectl logs -f deployment/sdrf-assistant -n "$NAMESPACE"
}

rollout() {
    echo -e "${GREEN}Rolling out the latest image...${NC}"
    kubectl rollout restart deployment/sdrf-assistant -n "$NAMESPACE"
    kubectl rollout status deployment/sdrf-assistant -n "$NAMESPACE" --timeout=600s
}

delete() {
    echo -e "${YELLOW}Deleting sdrf-assistant...${NC}"
    kubectl delete -f "$SCRIPT_DIR/ingress-pride-services.yaml" --ignore-not-found
    kubectl delete -f "$SCRIPT_DIR/service.yaml" --ignore-not-found
    kubectl delete -f "$SCRIPT_DIR/deployment.yaml" --ignore-not-found
    kubectl delete -f "$SCRIPT_DIR/secret.yaml" --ignore-not-found
    kubectl delete -f "$SCRIPT_DIR/configmap.yaml" --ignore-not-found
    echo -e "${GREEN}Deletion completed (namespace left in place; delete it yourself if you want it gone too)${NC}"
}

usage() {
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  deploy    Apply namespace, configmap, secret, deployment, service, ingress"
    echo "  status    Check deployment status"
    echo "  logs      Follow application logs"
    echo "  rollout   Restart the deployment to pick up a new image (after CI pushes)"
    echo "  delete    Delete deployment, service, ingress, configmap, secret (keeps namespace)"
    echo "  help      Show this help message"
}

case "${1:-help}" in
    deploy)
        check_kubectl
        check_secret_file
        deploy
        ;;
    status)
        check_kubectl
        status
        ;;
    logs)
        check_kubectl
        logs
        ;;
    rollout)
        check_kubectl
        rollout
        ;;
    delete)
        check_kubectl
        delete
        ;;
    help|*)
        usage
        ;;
esac
