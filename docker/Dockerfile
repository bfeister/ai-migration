FROM node:24-alpine

# Install system dependencies
RUN apk add --no-cache \
    git \
    bash \
    jq \
    curl \
    coreutils

# Enable and configure pnpm
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Create workspace directory
WORKDIR /workspace

# Create intervention directory and set permissions for node user
# Claude Code CLI requires non-root user for --dangerously-skip-permissions flag
RUN mkdir -p /workspace/intervention/history && \
    chown -R node:node /workspace

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Switch to non-root node user
USER node

# Default command
CMD ["/entrypoint.sh"]
