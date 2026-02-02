#!/bin/bash
# Debug script to investigate node_modules installation issues

echo "========================================="
echo "Node Modules Diagnostic"
echo "========================================="
echo ""

# Check if we're in the storefront-next directory
if [ ! -f "package.json" ]; then
    echo "ERROR: Not in a project directory with package.json"
    exit 1
fi

echo "Current directory: $(pwd)"
echo ""

# Check .npmrc configuration
echo "1. Checking .npmrc configuration:"
if [ -f ".npmrc" ]; then
    echo "   .npmrc exists:"
    cat .npmrc | sed 's/^/   | /'
else
    echo "   ⚠️  No .npmrc found"
fi
echo ""

# Check where pnpm thinks modules should go
echo "2. Checking pnpm configuration:"
pnpm config get modules-dir 2>/dev/null || echo "   (modules-dir not set)"
pnpm config get store-dir 2>/dev/null | sed 's/^/   store-dir: /'
echo ""

# Check for node_modules in various locations
echo "3. Checking node_modules locations:"
locations=(
    "./node_modules"
    "/node_modules"
    "$HOME/.local/share/pnpm"
)

for loc in "${locations[@]}"; do
    if [ -d "$loc" ]; then
        count=$(find "$loc" -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
        size=$(du -sh "$loc" 2>/dev/null | cut -f1)
        echo "   ✓ $loc exists ($count dirs, $size)"

        # Check for .bin directory
        if [ -d "$loc/.bin" ]; then
            bin_count=$(find "$loc/.bin" -type f -o -type l 2>/dev/null | wc -l | tr -d ' ')
            echo "     └─ .bin/ exists ($bin_count executables)"

            # Check specifically for sfnext
            if [ -f "$loc/.bin/sfnext" ] || [ -L "$loc/.bin/sfnext" ]; then
                echo "        └─ ✓ sfnext found"
                ls -la "$loc/.bin/sfnext" 2>/dev/null | sed 's/^/           /'
            else
                echo "        └─ ✗ sfnext NOT found"
            fi
        else
            echo "     └─ .bin/ does NOT exist"
        fi
    else
        echo "   ✗ $loc does not exist"
    fi
done
echo ""

# Check package.json for storefront-next-dev dependency
echo "4. Checking package.json dependencies:"
if command -v jq &>/dev/null; then
    sfnext_dep=$(jq -r '.dependencies["@salesforce/storefront-next-dev"] // .devDependencies["@salesforce/storefront-next-dev"] // "not found"' package.json)
    echo "   @salesforce/storefront-next-dev: $sfnext_dep"
else
    echo "   (jq not available, showing grep result)"
    grep -A1 '"@salesforce/storefront-next-dev"' package.json | sed 's/^/   /'
fi
echo ""

# Check if sfnext package is actually installed
echo "5. Checking for installed storefront-next-dev package:"
search_paths=(
    "./node_modules/@salesforce/storefront-next-dev"
    "/node_modules/@salesforce/storefront-next-dev"
)

for path in "${search_paths[@]}"; do
    if [ -d "$path" ]; then
        echo "   ✓ Found at: $path"
        if [ -f "$path/package.json" ]; then
            if command -v jq &>/dev/null; then
                version=$(jq -r '.version' "$path/package.json")
                echo "     Version: $version"
            fi

            # Check for bin entry in package.json
            if command -v jq &>/dev/null; then
                bin_entry=$(jq -r '.bin.sfnext // .bin // "no bin entry"' "$path/package.json")
                echo "     Bin entry: $bin_entry"
            else
                echo "     Bin entry: (check package.json manually)"
            fi
        fi

        # Check for actual bin file
        if [ -f "$path/dist/cli.js" ]; then
            echo "     ✓ dist/cli.js exists"
        else
            echo "     ✗ dist/cli.js missing"
        fi
    else
        echo "   ✗ Not found at: $path"
    fi
done
echo ""

# Check symlink resolution
echo "6. Testing sfnext command resolution:"
if command -v sfnext &>/dev/null; then
    echo "   ✓ sfnext is in PATH"
    which sfnext | sed 's/^/   → /'
else
    echo "   ✗ sfnext not in PATH"
fi
echo ""

# Check pnpm bin directory
echo "7. Checking pnpm global bin:"
pnpm_bin=$(pnpm bin 2>/dev/null)
if [ -n "$pnpm_bin" ]; then
    echo "   pnpm bin: $pnpm_bin"
    if [ -f "$pnpm_bin/sfnext" ]; then
        echo "   ✓ sfnext found in pnpm bin"
    else
        echo "   ✗ sfnext not in pnpm bin"
    fi
else
    echo "   (pnpm bin returned empty)"
fi
echo ""

echo "========================================="
echo "Diagnosis complete"
echo "========================================="
