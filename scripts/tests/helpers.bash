#!/bin/bash
# helpers.bash - Shared test utilities

# Load bats libraries
load "${BATS_LIB_PATH}/bats-support/load.bash"
load "${BATS_LIB_PATH}/bats-assert/load.bash"

# Get project root (two levels up from tests/)
export PROJECT_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
export SCRIPTS_DIR="$PROJECT_ROOT/scripts"
export INTERVENTION_DIR="$PROJECT_ROOT/intervention"
export TEST_INTERVENTION_DIR="$BATS_TEST_TMPDIR/intervention"

# Test utilities

# Setup function to run before each test
setup_test_environment() {
    # Create temporary intervention directory for testing
    mkdir -p "$TEST_INTERVENTION_DIR/history"

    # Set working directory to project root
    cd "$PROJECT_ROOT"
}

# Teardown function to run after each test
teardown_test_environment() {
    # Clean up test intervention files
    rm -rf "$TEST_INTERVENTION_DIR"

    # Clean up any test intervention files in actual directory
    rm -f "$INTERVENTION_DIR"/needed-test-*.json
    rm -f "$INTERVENTION_DIR"/response-test-*.json
}

# Create a test intervention file
# Usage: create_intervention worker_id question [options_json]
create_intervention() {
    local worker_id="$1"
    local question="$2"
    local options="${3:-}"

    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local file_path="$INTERVENTION_DIR/needed-test-${worker_id}.json"

    # Use jq to properly escape and create JSON
    if [ -n "$options" ]; then
        jq -n \
            --arg timestamp "$timestamp" \
            --arg question "$question" \
            --argjson options "$options" \
            --arg worker_id "test-$worker_id" \
            '{timestamp: $timestamp, question: $question, options: $options, worker_id: $worker_id}' \
            > "$file_path"
    else
        jq -n \
            --arg timestamp "$timestamp" \
            --arg question "$question" \
            --arg worker_id "test-$worker_id" \
            '{timestamp: $timestamp, question: $question, worker_id: $worker_id}' \
            > "$file_path"
    fi

    echo "$file_path"
}

# Create a response file
# Usage: create_response worker_id answer
create_response() {
    local worker_id="$1"
    local answer="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local file_path="$INTERVENTION_DIR/response-test-${worker_id}.json"

    jq -n \
        --arg timestamp "$timestamp" \
        --arg response "$answer" \
        --arg intervention_id "needed-test-${worker_id}" \
        '{timestamp: $timestamp, response: $response, intervention_id: $intervention_id}' \
        > "$file_path"

    echo "$file_path"
}

# Wait for a file to exist (with timeout)
# Usage: wait_for_file file_path [timeout_seconds]
wait_for_file() {
    local file_path="$1"
    local timeout="${2:-5}"
    local elapsed=0

    while [ ! -f "$file_path" ] && [ $elapsed -lt $timeout ]; do
        sleep 0.5
        elapsed=$((elapsed + 1))
    done

    [ -f "$file_path" ]
}

# Wait for a file to be removed (with timeout)
# Usage: wait_for_file_removal file_path [timeout_seconds]
wait_for_file_removal() {
    local file_path="$1"
    local timeout="${2:-5}"
    local elapsed=0

    while [ -f "$file_path" ] && [ $elapsed -lt $timeout ]; do
        sleep 0.5
        elapsed=$((elapsed + 1))
    done

    [ ! -f "$file_path" ]
}

# Check if Docker is running
docker_is_running() {
    docker info > /dev/null 2>&1
}

# Check if container exists
container_exists() {
    local container_name="$1"
    docker ps -a -q -f name="$container_name" | grep -q .
}

# Check if container is running
container_is_running() {
    local container_name="$1"
    docker ps -q -f name="$container_name" | grep -q .
}

# Start test container (lightweight)
start_test_container() {
    local container_name="${1:-claude-migration-test}"

    # Stop and remove if already exists
    if container_exists "$container_name"; then
        docker stop "$container_name" 2>/dev/null || true
        docker rm "$container_name" 2>/dev/null || true
    fi

    # Start minimal alpine container for testing
    docker run -d \
        --name "$container_name" \
        -v "$PROJECT_ROOT:/workspace" \
        alpine:latest \
        sleep 3600
}

# Stop test container
stop_test_container() {
    local container_name="${1:-claude-migration-test}"

    if container_exists "$container_name"; then
        docker stop "$container_name" 2>/dev/null || true
        docker rm "$container_name" 2>/dev/null || true
    fi
}

# Validate JSON file
is_valid_json() {
    local file_path="$1"
    jq empty "$file_path" 2>/dev/null
}

# Count files matching pattern
count_files() {
    local pattern="$1"
    ls -1 $pattern 2>/dev/null | wc -l | tr -d ' '
}
