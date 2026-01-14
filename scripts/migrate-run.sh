#!/bin/bash
set -euo pipefail

# migrate-run.sh - Start the migration Docker container

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Starting Claude Code Migration Runner...${NC}"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Warning: .env file not found${NC}"
    echo -e "${YELLOW}Copy .env.example to .env and add your ANTHROPIC_API_KEY${NC}"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if container is already running
if docker ps -q -f name=claude-migration | grep -q .; then
    echo -e "${YELLOW}Container 'claude-migration' is already running${NC}"
    read -p "Stop and restart? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Stopping existing container..."
        docker stop claude-migration
        docker rm claude-migration
    else
        echo "Exiting..."
        exit 0
    fi
fi

# Build and start container
echo "Building Docker image..."
cd docker && docker-compose build

echo "Starting container..."
docker-compose up -d

echo -e "${GREEN}✅ Migration container started${NC}"
echo ""
echo "Useful commands:"
echo "  View logs:        docker logs -f claude-migration"
echo "  Check status:     ./scripts/migrate-status.sh"
echo "  Watch for input:  ./scripts/migrate-watch.sh"
echo "  Enter container:  docker exec -it claude-migration bash"
echo "  Stop container:   docker stop claude-migration"
