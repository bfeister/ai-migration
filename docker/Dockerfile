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
