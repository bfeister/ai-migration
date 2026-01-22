#!/usr/bin/env bash
# test-detect-file-deps.sh - Test dynamic file:// dependency detection
#
# This script demonstrates how we dynamically detect file:// dependencies
# instead of hardcoding package names

set -euo pipefail

MONOREPO_PATH="${STOREFRONT_MONOREPO_PATH:-$HOME/dev/SFCC-Odyssey}"
TEMPLATE_PKG="$MONOREPO_PATH/packages/template-retail-rsc-app/package.json"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing Dynamic workspace:* and file:// Dependency Detection"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if monorepo exists
if [ ! -f "$TEMPLATE_PKG" ]; then
    echo "✗ Template package.json not found at: $TEMPLATE_PKG"
    echo "Set STOREFRONT_MONOREPO_PATH if monorepo is elsewhere"
    exit 1
fi

echo "✓ Found template: $TEMPLATE_PKG"
echo ""

# Show all dependencies
echo "All dependencies in template:"
echo "─────────────────────────────────────────────────────────────"
node -e "
const pkg = require('$TEMPLATE_PKG');
const deps = {...pkg.dependencies, ...pkg.devDependencies};
let count = 0;
for (const [name, version] of Object.entries(deps)) {
  count++;
  const icon = version.startsWith('file:') ? '📁' : '📦';
  console.log(\`  \${icon} \${name}: \${version}\`);
}
console.log();
console.log('Total:', count, 'dependencies');
"
echo ""

# Extract workspace:* and file:// dependencies
echo "Detected workspace:* and file:// dependencies:"
echo "─────────────────────────────────────────────────────────────"

MONOREPO_DEPS=$(node -e "
const pkg = require('$TEMPLATE_PKG');
const deps = {...pkg.dependencies, ...pkg.devDependencies};
for (const [name, version] of Object.entries(deps)) {
  if (version.startsWith('workspace:') || version.startsWith('file:')) {
    console.log(name + '|' + version);
  }
}
")

if [ -z "$MONOREPO_DEPS" ]; then
    echo "  (None found)"
else
    COUNT=0
    echo "$MONOREPO_DEPS" | while IFS='|' read -r name version; do
        COUNT=$((COUNT + 1))

        # Resolve path based on version type
        if [[ "$version" = workspace:* ]]; then
            # workspace:* dependencies - look in monorepo packages/
            pkg_name="${name##*/}"
            RESOLVED="$MONOREPO_PATH/packages/$pkg_name"
        elif [[ "$version" = file:* ]]; then
            # file:// dependencies - resolve relative path
            path="${version#file:}"
            TEMPLATE_DIR="$MONOREPO_PATH/packages/template-retail-rsc-app"

            if [[ "$path" = /* ]]; then
                RESOLVED="$path"
            else
                RESOLVED=$(cd "$TEMPLATE_DIR" && cd "$path" 2>/dev/null && pwd || echo "NOT_FOUND")
            fi
        fi

        # Check if exists
        if [ -d "$RESOLVED" ] && [ -f "$RESOLVED/package.json" ]; then
            STATUS="✓"
            COLOR="\033[0;32m"
        else
            STATUS="✗"
            COLOR="\033[0;31m"
        fi

        NC="\033[0m"
        echo -e "  ${COLOR}${STATUS}${NC} $name"
        echo "     Version: $version"
        echo "     Resolved: $RESOLVED"

        if [ -f "$RESOLVED/package.json" ]; then
            PKG_VERSION=$(node -p "require('$RESOLVED/package.json').version" 2>/dev/null || echo "unknown")
            echo "     Package version: $PKG_VERSION"
        fi
        echo ""
    done
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "This script demonstrates dynamic detection - no hardcoding!"
echo ""
echo "The generate-standalone-in-container.sh script uses this same"
echo "technique to automatically discover and pack all file:// deps."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
