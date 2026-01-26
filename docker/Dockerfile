FROM node:24-alpine

# Install system dependencies including Playwright/Chromium requirements
RUN apk add --no-cache \
    git \
    bash \
    jq \
    curl \
    coreutils \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji

# Set Playwright to use system Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Enable and configure pnpm
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

# Configure pnpm to reduce concurrency and avoid file descriptor exhaustion
# Note: hardlinks don't work across Docker volumes, so use copy with low concurrency
RUN pnpm config set network-concurrency 8 --global && \
    pnpm config set child-concurrency 2 --global && \
    pnpm config set fetch-retries 3 --global

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Create workspace directory
WORKDIR /workspace

# Create intervention directory
RUN mkdir -p /workspace/intervention/history

# Install su-exec for switching to node user after permission fixes
RUN apk add --no-cache su-exec

# Copy entrypoint scripts
COPY docker/pre-entrypoint.sh /pre-entrypoint.sh
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /pre-entrypoint.sh /entrypoint.sh

# Run as root initially - pre-entrypoint will fix permissions then switch to node
# USER root  # Already root by default

# Default command - runs as root first, then switches to node user
CMD ["/pre-entrypoint.sh"]
