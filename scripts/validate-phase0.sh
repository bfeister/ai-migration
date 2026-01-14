#!/bin/bash
set -euo pipefail

# validate-phase0.sh - Automated validation of Phase 0 implementation

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
RUN_INTEGRATION_TESTS=false
SKIP_BATS=false
RUN_DOCKER_TESTS=false
RUN_MOCK_CLAUDE_TEST=false
DOCKER_CONTAINER_NAME=""
DOCKER_CLEANUP_ON_SUCCESS=true

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --integration|--full)
            RUN_INTEGRATION_TESTS=true
            shift
            ;;
        --skip-bats)
            SKIP_BATS=true
            shift
            ;;
        --docker)
            RUN_DOCKER_TESTS=true
            shift
            ;;
        --keep-container)
            DOCKER_CLEANUP_ON_SUCCESS=false
            shift
            ;;
        --with-mock-claude)
            RUN_MOCK_CLAUDE_TEST=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --integration, --full    Run integration tests (live watcher test)"
            echo "  --skip-bats              Skip automated Bats test suite"
            echo "  --docker                 Start fresh Docker container, run tests, tear down"
            echo "  --keep-container         Don't remove container on success (only with --docker)"
            echo "  --with-mock-claude       Run mock Claude Code CLI integration test"
            echo "  -h, --help               Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                       # Standard validation (checks existing container)"
            echo "  $0 --integration         # Full validation with integration tests"
            echo "  $0 --docker              # Full validation with fresh Docker container"
            echo "  $0 --docker --integration # All tests with fresh container"
            echo "  $0 --with-mock-claude    # Test with simulated Claude Code CLI"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use -h or --help for usage information"
            exit 1
            ;;
    esac
done

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
print_header() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  $1${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_test() {
    echo -e "${CYAN}▶ Testing: $1${NC}"
}

pass() {
    echo -e "${GREEN}  ✅ PASS: $1${NC}"
    ((TESTS_PASSED++))
}

fail() {
    echo -e "${RED}  ❌ FAIL: $1${NC}"
    ((TESTS_FAILED++))
}

warn() {
    echo -e "${YELLOW}  ⚠️  WARN: $1${NC}"
}

# Docker container management functions
start_test_container() {
    local container_name="$1"

    print_test "Starting fresh Docker container"

    # Build the image first
    echo -e "  ${CYAN}Building Docker image...${NC}"
    if ! (cd docker && docker-compose build); then
        fail "Failed to build Docker image"
        return 1
    fi
    pass "Docker image built successfully"

    # Get the actual image name from docker-compose
    local image_name=$(cd docker && docker-compose config | grep 'image:' | awk '{print $2}' | head -1)
    if [ -z "$image_name" ]; then
        # Fallback: check for docker_claude-migration or claude-migration
        image_name=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep -E "claude-migration|docker.*claude-migration" | head -1)
        if [ -z "$image_name" ]; then
            fail "Could not determine Docker image name"
            return 1
        fi
    fi
    echo -e "  ${CYAN}Using image: $image_name${NC}"

    # Check if .env exists
    if [ ! -f ".env" ]; then
        warn "No .env file found - container may not have API key"
    fi

    # Load environment variables
    if [ -f ".env" ]; then
        set -a
        source .env
        set +a
    fi

    # Start container with custom name
    echo -e "  ${CYAN}Starting container: $container_name${NC}"

    if docker run -d \
        --name "$container_name" \
        -v "$(pwd):/workspace:cached" \
        -v /workspace/node_modules \
        -e "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}" \
        -w /workspace \
        --restart no \
        "$image_name" \
        /bin/sh -c "trap 'exit 0' TERM; sleep infinity & wait" > /dev/null 2>&1; then

        pass "Container started: $container_name"

        # Wait for container to be fully ready
        sleep 2

        # Verify container is running
        if docker ps -q -f name="$container_name" | grep -q .; then
            pass "Container is running and healthy"
            return 0
        else
            fail "Container started but is not running"
            echo -e "  ${CYAN}Container logs:${NC}"
            docker logs "$container_name" 2>&1 | tail -20 | sed 's/^/    /'
            return 1
        fi
    else
        fail "Failed to start container"
        echo -e "  ${CYAN}Docker error output:${NC}"
        docker run -d \
            --name "$container_name" \
            -v "$(pwd):/workspace:cached" \
            -v /workspace/node_modules \
            -e "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}" \
            -w /workspace \
            --restart no \
            "$image_name" \
            /bin/sh -c "trap 'exit 0' TERM; sleep infinity & wait" 2>&1 | sed 's/^/    /'
        return 1
    fi
}

stop_test_container() {
    local container_name="$1"

    print_test "Stopping and removing test container"

    if docker ps -a -q -f name="$container_name" | grep -q .; then
        echo -e "  ${CYAN}Stopping container: $container_name${NC}"
        docker stop "$container_name" > /dev/null 2>&1

        echo -e "  ${CYAN}Removing container: $container_name${NC}"
        docker rm "$container_name" > /dev/null 2>&1

        pass "Test container cleaned up"
    else
        warn "Container $container_name not found (already removed?)"
    fi
}

# Start validation
clear
print_header "Phase 0 Validation - Docker Foundation & Intervention Protocol"

# Setup Docker test container if --docker flag is used
if [ "$RUN_DOCKER_TESTS" = true ]; then
    # Generate unique container name with timestamp
    DOCKER_CONTAINER_NAME="claude-migration-test-$(date +%s)"

    print_header "Docker Test Setup"
    echo -e "${CYAN}Container name: $DOCKER_CONTAINER_NAME${NC}"
    echo -e "${CYAN}Cleanup on success: $DOCKER_CLEANUP_ON_SUCCESS${NC}"
    echo ""

    START_TIME=$(date +%s)

    # Start the test container
    if ! start_test_container "$DOCKER_CONTAINER_NAME"; then
        echo -e "${RED}Failed to start test container. Aborting.${NC}"
        exit 1
    fi

    # Setup trap to cleanup on exit (will be updated at end based on test results)
    cleanup_docker_test() {
        # Always cleanup on interrupt/termination
        if [ "$?" -ne 0 ] || [ "$DOCKER_CLEANUP_ON_SUCCESS" = true ]; then
            stop_test_container "$DOCKER_CONTAINER_NAME"
        elif [ "$RUN_DOCKER_TESTS" = true ]; then
            echo ""
            echo -e "${CYAN}Keeping test container: $DOCKER_CONTAINER_NAME${NC}"
            echo -e "${CYAN}Remove with: docker rm -f $DOCKER_CONTAINER_NAME${NC}"
        fi
    }
    trap cleanup_docker_test EXIT INT TERM

    echo ""
    print_header "Running Tests with Docker Container"
else
    # Use default container name for existing container checks
    DOCKER_CONTAINER_NAME="claude-migration"
    echo -e "${CYAN}Checking for existing container: $DOCKER_CONTAINER_NAME${NC}"
    echo ""
fi

# Test 0: Run automated Bats test suite
if [ "$SKIP_BATS" = false ]; then
    print_header "Automated Test Suite (Bats)"

    if [ -f "scripts/test-runner.sh" ]; then
        if ./scripts/test-runner.sh; then
            pass "Automated test suite passed (33 tests)"
        else
            fail "Automated test suite failed - see output above"
        fi
    else
        warn "Test runner not found - skipping automated tests"
    fi

    print_header "Environment Validation"
else
    echo -e "${YELLOW}Skipping automated Bats tests (--skip-bats flag)${NC}"
    echo ""
fi

# Test 1: Check directory structure
print_test "Directory structure"
if [ -d "docker" ] && [ -d "scripts" ] && [ -d "intervention" ]; then
    pass "All required directories exist"
else
    fail "Missing required directories"
fi

# Test 2: Check required files
print_test "Required files exist"
REQUIRED_FILES=(
    "docker/Dockerfile"
    "docker/docker-compose.yml"
    "docker/.dockerignore"
    "docker/entrypoint.sh"
    ".env.example"
    "scripts/migrate-run.sh"
    "scripts/migrate-status.sh"
    "scripts/migrate-watch.sh"
    "scripts/migrate-watch.ts"
    "scripts/migrate-respond.sh"
    "scripts/test-runner.sh"
)

MISSING_FILES=()
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        MISSING_FILES+=("$file")
    fi
done

if [ ${#MISSING_FILES[@]} -eq 0 ]; then
    pass "All required files present (${#REQUIRED_FILES[@]} files)"
else
    fail "Missing files: ${MISSING_FILES[*]}"
fi

# Test 3: Check script permissions
print_test "Script permissions"
SCRIPTS=(
    "scripts/migrate-run.sh"
    "scripts/migrate-status.sh"
    "scripts/migrate-watch.sh"
    "scripts/migrate-respond.sh"
    "scripts/test-runner.sh"
    "docker/entrypoint.sh"
)

NON_EXECUTABLE=()
for script in "${SCRIPTS[@]}"; do
    if [ ! -x "$script" ]; then
        NON_EXECUTABLE+=("$script")
    fi
done

if [ ${#NON_EXECUTABLE[@]} -eq 0 ]; then
    pass "All scripts are executable"
else
    fail "Non-executable scripts: ${NON_EXECUTABLE[*]}"
fi

# Test 4: Check .env file
print_test "Environment configuration"
if [ -f ".env" ]; then
    if grep -q "ANTHROPIC_API_KEY=sk-ant-" .env 2>/dev/null; then
        pass ".env file exists with API key"
    elif grep -q "ANTHROPIC_API_KEY=your_api_key_here" .env 2>/dev/null; then
        warn ".env exists but API key not set (using placeholder)"
    else
        warn ".env exists but API key format unclear"
    fi
else
    fail ".env file not found (copy from .env.example)"
fi

# Test 5: Docker availability
print_test "Docker availability"
if command -v docker &> /dev/null; then
    pass "Docker command available"

    if docker info &> /dev/null; then
        pass "Docker daemon is running"
    else
        fail "Docker daemon is not running"
    fi
else
    fail "Docker is not installed"
fi

# Test 6: Check if container is running
print_test "Container status"
if docker ps -q -f name="$DOCKER_CONTAINER_NAME" | grep -q .; then
    pass "Container '$DOCKER_CONTAINER_NAME' is running"

    # Additional checks if container is running
    print_test "Container health checks"

    # Check if entrypoint is running
    if docker exec "$DOCKER_CONTAINER_NAME" pgrep -f entrypoint.sh > /dev/null 2>&1; then
        pass "Entrypoint process is running"
    else
        warn "Entrypoint process may not be running"
    fi

    # Check if jq is installed in container
    if docker exec "$DOCKER_CONTAINER_NAME" command -v jq > /dev/null 2>&1; then
        pass "jq is installed in container"
    else
        fail "jq is not installed in container"
    fi

    # Check if Claude Code CLI is installed
    if docker exec "$DOCKER_CONTAINER_NAME" command -v claude > /dev/null 2>&1; then
        pass "Claude Code CLI is installed"

        # Get version
        VERSION=$(docker exec "$DOCKER_CONTAINER_NAME" claude --version 2>&1 || echo "unknown")
        echo -e "    ${CYAN}Version: $VERSION${NC}"
    else
        fail "Claude Code CLI is not installed"
    fi

    # Check if git is installed
    if docker exec "$DOCKER_CONTAINER_NAME" command -v git > /dev/null 2>&1; then
        pass "Git is installed in container"
    else
        fail "Git is not installed in container"
    fi

    # Check intervention directory
    if docker exec "$DOCKER_CONTAINER_NAME" test -d /workspace/intervention/history 2>&1; then
        pass "Intervention directory structure exists"
    else
        fail "Intervention directory structure missing"
    fi

    # Check if log file exists
    if [ -f "migration-log.md" ]; then
        pass "Migration log file exists"
        LINES=$(wc -l < migration-log.md)
        echo -e "    ${CYAN}Log has $LINES lines${NC}"
    else
        warn "Migration log file not created yet"
    fi

else
    warn "Container is not running (this is OK if not started yet)"
    echo -e "    ${CYAN}Run: ./scripts/migrate-run.sh to start${NC}"
fi

# Test 7: Test intervention protocol (updated for new pattern)
if docker ps -q -f name=claude-migration | grep -q .; then
    print_test "Intervention protocol (file-based test)"

    # Clean up any existing test intervention files
    rm -f intervention/needed-validation-test.json intervention/response-validation-test.json

    # Create test intervention using new naming pattern
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    cat > intervention/needed-validation-test.json <<EOF
{
  "timestamp": "$TIMESTAMP",
  "question": "Phase 0 validation test - what is 2+2?",
  "options": ["3", "4", "5"],
  "context": "Automated validation test",
  "worker_id": "validation-test"
}
EOF

    if [ -f "intervention/needed-validation-test.json" ]; then
        pass "Created test intervention request (new pattern)"

        # Wait a moment for container to detect it
        sleep 1

        # Check container logs for intervention detection
        if docker logs "$DOCKER_CONTAINER_NAME" 2>&1 | tail -20 | grep -q "Intervention needed\|intervention"; then
            pass "Container detected intervention request"
        else
            warn "Container may not have detected intervention yet"
        fi

        # Create response
        cat > intervention/response-validation-test.json <<EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "response": "4",
  "question_timestamp": "$TIMESTAMP",
  "intervention_id": "needed-validation-test"
}
EOF

        if [ -f "intervention/response-validation-test.json" ]; then
            pass "Created test intervention response"

            # Wait for container to process it
            sleep 3

            # Check if files were archived
            if [ -d "intervention/history" ]; then
                HISTORY_COUNT=$(ls -1 intervention/history/*.json 2>/dev/null | wc -l | tr -d ' ')
                if [ "$HISTORY_COUNT" -gt 0 ]; then
                    pass "Interventions archived to history/ ($HISTORY_COUNT total)"
                else
                    warn "No archived interventions found yet"
                fi
            fi

            # Clean up test files
            rm -f intervention/needed-validation-test.json intervention/response-validation-test.json
        else
            fail "Failed to create intervention response"
        fi
    else
        fail "Failed to create intervention request"
    fi
else
    warn "Skipping intervention protocol test (container not running)"
fi

# Test 8: Integration test - Live watcher
if [ "$RUN_INTEGRATION_TESTS" = true ]; then
    print_header "Integration Tests"
    print_test "Live watcher detection (TypeScript)"

    # Clean up any existing test files
    rm -f intervention/needed-integration-*.json

    # Create output file for watcher logs
    WATCHER_LOG=$(mktemp)

    echo -e "  ${CYAN}Starting migrate-watch.sh in background...${NC}"

    # Start watcher in background with output redirected
    ./scripts/migrate-watch.sh > "$WATCHER_LOG" 2>&1 &
    WATCHER_PID=$!

    # Give watcher time to start
    sleep 2

    # Check if watcher is still running
    if kill -0 $WATCHER_PID 2>/dev/null; then
        pass "Watcher process started (PID: $WATCHER_PID)"

        # Create first intervention file
        echo -e "  ${CYAN}Creating intervention file 1...${NC}"
        echo '{"timestamp":"2026-01-14T00:00:00Z","question":"Integration test 1","options":["A","B"],"worker_id":"integration-1"}' > intervention/needed-integration-1.json

        sleep 2

        # Check if watcher detected it
        if grep -q "File added\|Detected file\|needed-integration-1" "$WATCHER_LOG"; then
            pass "Watcher detected intervention file 1"
        else
            warn "Watcher may not have detected file (check manually)"
        fi

        # Create second intervention file
        echo -e "  ${CYAN}Creating intervention file 2...${NC}"
        echo '{"timestamp":"2026-01-14T00:01:00Z","question":"Integration test 2","worker_id":"integration-2"}' > intervention/needed-integration-2.json

        sleep 2

        # Check if watcher detected it
        if grep -q "File added\|Detected file\|needed-integration-2" "$WATCHER_LOG"; then
            pass "Watcher detected intervention file 2"
        else
            warn "Watcher may not have detected file (check manually)"
        fi

        # Stop the watcher
        echo -e "  ${CYAN}Stopping watcher...${NC}"
        kill -INT $WATCHER_PID 2>/dev/null || true
        wait $WATCHER_PID 2>/dev/null || true

        pass "Watcher stopped cleanly"

        # Show relevant log lines
        echo -e "  ${CYAN}Watcher log excerpt:${NC}"
        grep -E "Monitoring|Watching|File added|Detected file|needed-integration" "$WATCHER_LOG" | head -10 | sed 's/^/    /'

    else
        fail "Watcher process failed to start or crashed immediately"
        echo -e "  ${CYAN}Check logs:${NC}"
        cat "$WATCHER_LOG" | head -20 | sed 's/^/    /'
    fi

    # Cleanup
    rm -f "$WATCHER_LOG"
    rm -f intervention/needed-integration-*.json

else
    echo -e "${YELLOW}Skipping integration tests (use --integration flag to run)${NC}"
    echo ""
fi

# Test 8.5: Mock Claude Code Integration Test
if [ "$RUN_MOCK_CLAUDE_TEST" = true ]; then
    print_header "Mock Claude Code Integration Test"
    print_test "Simulated Claude Code CLI workflow"

    # Ensure mock script exists
    if [ ! -f "scripts/tests/mock-claude-code.sh" ]; then
        fail "Mock Claude script not found"
    else
        # Clean up any existing mock test files
        rm -f intervention/needed-mock-*.json
        rm -f intervention/response-mock-*.json

        # Create temporary log files
        WATCHER_LOG=$(mktemp)
        MOCK_CLAUDE_LOG=$(mktemp)

        WORKER_ID="mock-worker-$$"  # Use PID for uniqueness

        echo -e "  ${CYAN}Starting migrate-watch.sh in background...${NC}"

        # Start watcher in background
        ./scripts/migrate-watch.sh > "$WATCHER_LOG" 2>&1 &
        WATCHER_PID=$!

        # Give watcher time to start
        sleep 3

        # Check if watcher is running
        if ! kill -0 $WATCHER_PID 2>/dev/null; then
            fail "Watcher failed to start"
            cat "$WATCHER_LOG" | head -20 | sed 's/^/    /'
        else
            pass "Watcher started (PID: $WATCHER_PID)"

            echo -e "  ${CYAN}Starting mock Claude Code CLI...${NC}"

            # Start mock Claude in background
            ./scripts/tests/mock-claude-code.sh "$WORKER_ID" > "$MOCK_CLAUDE_LOG" 2>&1 &
            MOCK_CLAUDE_PID=$!

            # Wait for mock Claude to create intervention file
            echo -e "  ${CYAN}Waiting for mock Claude to create intervention...${NC}"
            sleep 3

            # Check if intervention file was created
            INTERVENTION_FILE="intervention/needed-$WORKER_ID.json"
            if [ -f "$INTERVENTION_FILE" ]; then
                pass "Mock Claude created intervention file"

                # Check if watcher detected it
                sleep 2
                if grep -q "File added\|Detected file\|needed-$WORKER_ID" "$WATCHER_LOG"; then
                    pass "Watcher detected mock Claude's intervention"
                else
                    warn "Watcher may not have detected intervention"
                fi

                # Automatically provide response (simulate user input)
                echo -e "  ${CYAN}Providing automated response...${NC}"
                RESPONSE_FILE="intervention/response-$WORKER_ID.json"
                cat > "$RESPONSE_FILE" <<EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "response": "Yes",
  "question_timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "intervention_id": "needed-$WORKER_ID"
}
EOF
                pass "Response file created"

                # Wait for mock Claude to complete
                echo -e "  ${CYAN}Waiting for mock Claude to complete...${NC}"
                TIMEOUT=15
                ELAPSED=0
                while kill -0 $MOCK_CLAUDE_PID 2>/dev/null && [ $ELAPSED -lt $TIMEOUT ]; do
                    sleep 1
                    ELAPSED=$((ELAPSED + 1))
                done

                if ! kill -0 $MOCK_CLAUDE_PID 2>/dev/null; then
                    # Check exit status
                    wait $MOCK_CLAUDE_PID 2>/dev/null
                    if [ $? -eq 0 ]; then
                        pass "Mock Claude completed successfully"
                    else
                        fail "Mock Claude exited with error"
                        echo -e "  ${CYAN}Mock Claude log:${NC}"
                        cat "$MOCK_CLAUDE_LOG" | sed 's/^/    /'
                    fi
                else
                    warn "Mock Claude still running after timeout"
                    kill -TERM $MOCK_CLAUDE_PID 2>/dev/null || true
                fi

                # Verify archiving (watcher should have archived the files)
                sleep 2
                if [ ! -f "$INTERVENTION_FILE" ] || [ -d "intervention/history" ]; then
                    ARCHIVED_COUNT=$(ls -1 intervention/history/*needed-$WORKER_ID*.json 2>/dev/null | wc -l | tr -d ' ')
                    if [ "$ARCHIVED_COUNT" -gt 0 ]; then
                        pass "Intervention was archived to history/"
                    else
                        warn "Intervention may not have been archived yet"
                    fi
                else
                    warn "Archiving verification skipped"
                fi

            else
                fail "Mock Claude did not create intervention file"
                echo -e "  ${CYAN}Mock Claude log:${NC}"
                cat "$MOCK_CLAUDE_LOG" | sed 's/^/    /'
            fi

            # Stop the watcher
            echo -e "  ${CYAN}Stopping watcher...${NC}"
            kill -INT $WATCHER_PID 2>/dev/null || true
            wait $WATCHER_PID 2>/dev/null || true
            pass "Watcher stopped"

            # Show log excerpts
            echo -e "  ${CYAN}Mock Claude log excerpt:${NC}"
            grep -E "Mock Claude|intervention|response" "$MOCK_CLAUDE_LOG" | head -15 | sed 's/^/    /'

            echo -e "  ${CYAN}Watcher log excerpt:${NC}"
            grep -E "Monitoring|File added|Detected file|needed-$WORKER_ID" "$WATCHER_LOG" | head -10 | sed 's/^/    /'
        fi

        # Cleanup
        rm -f "$WATCHER_LOG" "$MOCK_CLAUDE_LOG"
        rm -f intervention/needed-mock-*.json
        rm -f intervention/response-mock-*.json

        echo ""
    fi
else
    echo -e "${YELLOW}Skipping mock Claude test (use --with-mock-claude flag to run)${NC}"
    echo ""
fi

# Test 9: CLI scripts functionality
print_test "CLI scripts (basic syntax check)"
for script in scripts/migrate-*.sh; do
    if bash -n "$script" 2>/dev/null; then
        pass "$(basename "$script") has valid syntax"
    else
        fail "$(basename "$script") has syntax errors"
    fi
done

# Test 10: Volume mount check (if container running)
if docker ps -q -f name=claude-migration | grep -q .; then
    print_test "Volume mount verification"

    # Create test file on host
    TEST_FILE="test-volume-mount-$$.txt"
    echo "test" > "$TEST_FILE"

    # Check if visible in container
    if docker exec "$DOCKER_CONTAINER_NAME" test -f "/workspace/$TEST_FILE" 2>&1; then
        pass "Volume mount working (host files visible in container)"
        rm -f "$TEST_FILE"
    else
        fail "Volume mount not working correctly"
    fi
fi

# Summary
print_header "Validation Summary"

TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))

echo -e "${CYAN}Total Tests:${NC} $TOTAL_TESTS"
echo -e "${GREEN}Passed:${NC}      $TESTS_PASSED"
echo -e "${RED}Failed:${NC}      $TESTS_FAILED"

if [ "$RUN_DOCKER_TESTS" = true ] && [ -n "$START_TIME" ]; then
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    echo -e "${CYAN}Duration:${NC}    ${DURATION}s (including Docker setup/teardown)"
fi

echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✅ Phase 0 Validation: ALL TESTS PASSED                ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}Next Steps:${NC}"
    if [ "$RUN_DOCKER_TESTS" = true ]; then
        if [ "$DOCKER_CLEANUP_ON_SUCCESS" = true ]; then
            echo "  1. Test container was automatically cleaned up"
            echo "  2. Use --keep-container to preserve test containers"
        else
            echo "  1. Review container logs:  docker logs $DOCKER_CONTAINER_NAME"
            echo "  2. Remove test container:  docker rm -f $DOCKER_CONTAINER_NAME"
        fi
        echo "  3. Check status:           ./scripts/migrate-status.sh"
        echo "  4. Test manually:          ./scripts/migrate-watch.sh"
    else
        echo "  1. Review container logs:  docker logs $DOCKER_CONTAINER_NAME"
        echo "  2. Check status:           ./scripts/migrate-status.sh"
        echo "  3. Test manually:          ./scripts/migrate-watch.sh"
    fi
    echo "  Ready for Phase 1:         Worktree integration"
    echo ""
    if [ "$RUN_INTEGRATION_TESTS" = false ]; then
        echo -e "${YELLOW}Tip:${NC} Run with --integration flag for full integration testing"
    fi
    if [ "$RUN_MOCK_CLAUDE_TEST" = false ]; then
        echo -e "${YELLOW}Tip:${NC} Run with --with-mock-claude flag to test simulated Claude Code CLI"
    fi
    exit 0
else
    echo -e "${RED}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ❌ Phase 0 Validation: SOME TESTS FAILED               ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Please fix the failed tests before proceeding to Phase 1${NC}"
    exit 1
fi
