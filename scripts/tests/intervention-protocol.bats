#!/usr/bin/env bats
# intervention-protocol.bats - Tests for intervention protocol

# Set BATS_LIB_PATH before loading helpers
export BATS_LIB_PATH="${BATS_TEST_DIRNAME}/../node_modules"

# Load test helpers
load helpers

setup() {
    setup_test_environment
}

teardown() {
    teardown_test_environment
}

# Test: Intervention directory structure exists
@test "intervention directory structure exists" {
    [ -d "$INTERVENTION_DIR" ]
    [ -d "$INTERVENTION_DIR/history" ]
}

# Test: Can create intervention file
@test "can create intervention file with options" {
    local file_path=$(create_intervention "worker1" "Test question?" '["Option A","Option B"]')

    [ -f "$file_path" ]
    run is_valid_json "$file_path"
    assert_success

    # Verify structure
    run jq -r '.question' "$file_path"
    assert_output "Test question?"

    run jq -r '.worker_id' "$file_path"
    assert_output "test-worker1"

    run jq -r '.options[0]' "$file_path"
    assert_output "Option A"
}

# Test: Can create intervention file without options
@test "can create intervention file without options" {
    local file_path=$(create_intervention "worker2" "Free text question")

    [ -f "$file_path" ]
    run is_valid_json "$file_path"
    assert_success

    # Verify no options field or it's null
    run jq -r '.options' "$file_path"
    assert_output "null"
}

# Test: Can create response file
@test "can create response file" {
    local file_path=$(create_response "worker1" "My answer")

    [ -f "$file_path" ]
    run is_valid_json "$file_path"
    assert_success

    run jq -r '.response' "$file_path"
    assert_output "My answer"
}

# Test: Multiple intervention files can coexist
@test "multiple intervention files can coexist" {
    create_intervention "worker1" "Question 1" '["A","B"]'
    create_intervention "worker2" "Question 2" '["C","D"]'
    create_intervention "worker3" "Question 3"

    run count_files "$INTERVENTION_DIR/needed-test-*.json"
    assert_output "3"
}

# Test: Intervention files are properly named
@test "intervention files follow naming convention" {
    local file_path=$(create_intervention "worker1" "Test")

    # Should match pattern: needed-test-{worker_id}.json
    [[ "$file_path" =~ needed-test-worker1\.json$ ]]
}

# Test: Response files are properly named
@test "response files follow naming convention" {
    local file_path=$(create_response "worker1" "Test answer")

    # Should match pattern: response-test-{worker_id}.json
    [[ "$file_path" =~ response-test-worker1\.json$ ]]
}

# Test: Intervention file contains required fields
@test "intervention file contains required fields" {
    local file_path=$(create_intervention "worker1" "Test question")

    # Required fields
    run jq -e '.timestamp' "$file_path"
    assert_success

    run jq -e '.question' "$file_path"
    assert_success

    run jq -e '.worker_id' "$file_path"
    assert_success
}

# Test: Response file contains required fields
@test "response file contains required fields" {
    local file_path=$(create_response "worker1" "Test answer")

    # Required fields
    run jq -e '.timestamp' "$file_path"
    assert_success

    run jq -e '.response' "$file_path"
    assert_success

    run jq -e '.intervention_id' "$file_path"
    assert_success
}

# Test: JSON is valid and well-formed
@test "intervention JSON is valid" {
    local file_path=$(create_intervention "worker1" "Test" '["A","B"]')

    run jq '.' "$file_path"
    assert_success
}

# Test: Special characters in questions are properly escaped
@test "special characters in questions are handled" {
    local file_path=$(create_intervention "worker1" 'Question with "quotes" and $special chars?')

    run is_valid_json "$file_path"
    assert_success

    run jq -r '.question' "$file_path"
    assert_output 'Question with "quotes" and $special chars?'
}

# Test: Empty options array is valid
@test "empty options array is valid" {
    local file_path=$(create_intervention "worker1" "Test" '[]')

    run is_valid_json "$file_path"
    assert_success

    run jq -r '.options | length' "$file_path"
    assert_output "0"
}

# Test: Cleanup removes test files
@test "cleanup removes test intervention files" {
    create_intervention "worker1" "Test 1"
    create_intervention "worker2" "Test 2"

    run count_files "$INTERVENTION_DIR/needed-test-*.json"
    assert_output "2"

    teardown_test_environment

    run count_files "$INTERVENTION_DIR/needed-test-*.json"
    assert_output "0"
}
