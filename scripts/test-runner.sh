#!/bin/bash
set -euo pipefail

# test-runner.sh - Orchestrates all tests for the migration system

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Configuration
RUN_DOCKER_TESTS=false
VERBOSE=false
SPECIFIC_TEST=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --docker)
            RUN_DOCKER_TESTS=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        --test)
            SPECIFIC_TEST="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --docker          Include Docker container tests (requires Docker)"
            echo "  -v, --verbose     Verbose output"
            echo "  --test <name>     Run specific test file (e.g., intervention-protocol)"
            echo "  -h, --help        Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                        # Run all tests (no Docker)"
            echo "  $0 --docker               # Run all tests including Docker"
            echo "  $0 --test intervention    # Run only intervention protocol tests"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use -h or --help for usage information"
            exit 1
            ;;
    esac
done

# Banner
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  Migration System Test Runner                           ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

# Check if we're in the right directory
if [ ! -f "$PROJECT_ROOT/PHASE0-README.md" ]; then
    echo -e "${RED}❌ Error: Not in project root directory${NC}"
    exit 1
fi

# Check if bats is installed
if [ ! -d "$SCRIPT_DIR/node_modules/bats" ]; then
    echo -e "${YELLOW}⚠  Bats not installed, installing dependencies...${NC}"
    cd "$SCRIPT_DIR" && pnpm install
fi

# Check Docker if needed
if [ "$RUN_DOCKER_TESTS" = true ]; then
    if ! docker info > /dev/null 2>&1; then
        echo -e "${RED}❌ Docker is not running${NC}"
        echo "   Start Docker or run without --docker flag"
        exit 1
    fi
    echo -e "${GREEN}✓${NC} Docker is available"
fi

echo -e "${GREEN}✓${NC} Prerequisites checked"
echo ""

# Test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run a test suite
run_test_suite() {
    local test_file="$1"
    local test_name="$2"

    echo -e "${BLUE}Running: ${test_name}${NC}"
    echo "────────────────────────────────────────────────────────────"

    local bats_cmd="$SCRIPT_DIR/node_modules/.bin/bats"
    local test_path="$SCRIPT_DIR/tests/${test_file}.bats"

    if [ ! -f "$test_path" ]; then
        echo -e "${RED}❌ Test file not found: $test_path${NC}"
        return 1
    fi

    if [ "$VERBOSE" = true ]; then
        if "$bats_cmd" "$test_path"; then
            echo -e "${GREEN}✓ ${test_name} passed${NC}"
            return 0
        else
            echo -e "${RED}✗ ${test_name} failed${NC}"
            return 1
        fi
    else
        # Run silently and capture output
        if output=$("$bats_cmd" "$test_path" 2>&1); then
            # Count passed tests
            local passed=$(echo "$output" | grep -c "^ok " || true)
            if [ -z "$passed" ] || [ "$passed" = "" ]; then
                passed=0
            fi
            PASSED_TESTS=$((PASSED_TESTS + passed))
            echo -e "${GREEN}✓ ${test_name} passed ($passed tests)${NC}"
            return 0
        else
            # Show failures
            echo "$output" | grep "not ok" || true
            echo -e "${RED}✗ ${test_name} failed${NC}"
            echo ""
            echo "Run with -v for detailed output"
            return 1
        fi
    fi
}

# Run test suites
cd "$PROJECT_ROOT"

if [ -n "$SPECIFIC_TEST" ]; then
    # Run specific test
    echo -e "${CYAN}Running specific test: $SPECIFIC_TEST${NC}"
    echo ""
    if run_test_suite "$SPECIFIC_TEST" "$SPECIFIC_TEST"; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
else
    # Run all test suites
    echo -e "${CYAN}Running all test suites...${NC}"
    echo ""

    # Intervention Protocol Tests
    if run_test_suite "intervention-protocol" "Intervention Protocol"; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo ""

    # Migrate Scripts Tests
    if run_test_suite "migrate-scripts" "Migration Scripts"; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo ""

    # Docker Tests (if enabled)
    if [ "$RUN_DOCKER_TESTS" = true ]; then
        echo -e "${YELLOW}Note: Docker tests would run here (not yet implemented)${NC}"
        echo ""
    fi
fi

# Summary
echo ""
echo "════════════════════════════════════════════════════════════"
echo -e "${BLUE}Test Summary${NC}"
echo "════════════════════════════════════════════════════════════"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✓ All test suites passed!${NC}"
    echo ""
    echo "Test suites: $PASSED_TESTS/$TOTAL_TESTS passed"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    echo ""
    echo "Test suites: $PASSED_TESTS/$TOTAL_TESTS passed, $FAILED_TESTS failed"
    echo ""
    echo "Run with -v for detailed output"
    exit 1
fi
