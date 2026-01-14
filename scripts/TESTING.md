# Testing Guide for Migration System

This guide covers the automated testing setup for the Claude Code migration intervention protocol.

## Overview

We use **Bats** (Bash Automated Testing System) to test the intervention protocol and migration scripts. The test suite validates:

- ✅ Intervention file creation and validation
- ✅ Response file creation and validation
- ✅ Script functionality and error handling
- ✅ JSON structure and special character handling
- ✅ Multi-file intervention support
- ✅ Docker configuration (optional)

## Quick Start

### Run All Tests

```bash
cd /Users/bfeister/dev/test-storefront
./scripts/test-runner.sh
```

### Run Specific Test Suite

```bash
# Intervention protocol tests only
./scripts/test-runner.sh --test intervention-protocol

# Migration scripts tests only
./scripts/test-runner.sh --test migrate-scripts
```

### Verbose Mode

```bash
# See detailed output for each test
./scripts/test-runner.sh -v
```

### With Docker Tests

```bash
# Include Docker-based tests (requires Docker running)
./scripts/test-runner.sh --docker
```

## Test Structure

```
scripts/
├── tests/
│   ├── helpers.bash                   # Shared test utilities
│   ├── intervention-protocol.bats    # Intervention protocol tests
│   └── migrate-scripts.bats          # Migration script tests
├── test-runner.sh                     # Main test orchestrator
└── package.json                       # Test dependencies (bats, etc.)
```

## Test Suites

### Intervention Protocol Tests

Tests the core intervention file protocol:

- File creation with and without options
- JSON validation
- Required field validation
- Special character handling
- Multiple concurrent interventions
- Cleanup and archiving

**Run:**
```bash
./scripts/test-runner.sh --test intervention-protocol
```

### Migration Scripts Tests

Tests the migration helper scripts:

- Script existence and executability
- Proper error handling (set -euo pipefail)
- Dependencies and configuration
- Docker setup validation
- Package.json structure

**Run:**
```bash
./scripts/test-runner.sh --test migrate-scripts
```

## Using pnpm Scripts

You can also run tests via pnpm:

```bash
cd scripts

# Run all tests
pnpm test

# Run specific test suite
pnpm test:intervention
pnpm test:scripts
```

## Writing New Tests

### Basic Test Structure

```bash
#!/usr/bin/env bats

# Set BATS_LIB_PATH
export BATS_LIB_PATH="${BATS_TEST_DIRNAME}/../node_modules"

# Load helpers
load helpers

setup() {
    setup_test_environment
}

teardown() {
    teardown_test_environment
}

@test "descriptive test name" {
    # Arrange
    local file_path=$(create_intervention "worker1" "Question?" '["A","B"]')

    # Act
    run is_valid_json "$file_path"

    # Assert
    assert_success
}
```

### Available Helper Functions

From `helpers.bash`:

**File Creation:**
- `create_intervention worker_id question [options_json]` - Create test intervention file
- `create_response worker_id answer` - Create test response file

**Validation:**
- `is_valid_json file_path` - Check if file is valid JSON
- `count_files pattern` - Count files matching pattern

**Docker:**
- `docker_is_running` - Check if Docker daemon is running
- `container_exists name` - Check if container exists
- `container_is_running name` - Check if container is running
- `start_test_container [name]` - Start a test container
- `stop_test_container [name]` - Stop and remove test container

**Waiting:**
- `wait_for_file file_path [timeout]` - Wait for file to exist
- `wait_for_file_removal file_path [timeout]` - Wait for file to be removed

### Assertions

From `bats-assert`:

- `assert_success` - Assert last command succeeded
- `assert_failure` - Assert last command failed
- `assert_output "text"` - Assert output matches text
- `assert_line "text"` - Assert a line matches text

## Continuous Integration

The test suite is designed to run in CI environments:

```bash
# In your CI pipeline
cd scripts
pnpm install
../scripts/test-runner.sh
```

**Exit Codes:**
- `0` - All tests passed
- `1` - One or more tests failed

## Troubleshooting

### Tests fail with "bats not found"

```bash
cd scripts
pnpm install
```

### Tests fail with Docker errors

Either:
1. Start Docker daemon
2. Run without Docker tests: `./scripts/test-runner.sh` (no --docker flag)

### JSON validation fails

Check that `jq` is installed:
```bash
which jq
brew install jq  # macOS
```

### Permission errors

Make scripts executable:
```bash
chmod +x scripts/test-runner.sh
chmod +x scripts/tests/*.bash
```

## Test Coverage

Current test coverage:

- **Intervention Protocol**: 13 tests
  - File creation and structure
  - JSON validation
  - Special characters
  - Multi-file support

- **Migration Scripts**: 20 tests
  - Script existence
  - Error handling
  - Dependencies
  - Configuration

**Total: 33 tests**

## Adding New Test Suites

1. Create new `.bats` file in `scripts/tests/`
2. Add test cases following existing patterns
3. Update `test-runner.sh` to include new suite
4. Add pnpm script to `package.json`

Example:
```bash
# Create new test file
touch scripts/tests/docker-integration.bats

# Add to test-runner.sh in the "Run all test suites" section
if run_test_suite "docker-integration" "Docker Integration"; then
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi
```

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Use `teardown()` to clean up test files
3. **Clear names**: Test names should describe what they test
4. **Fast tests**: Keep tests fast (<1s each when possible)
5. **Meaningful assertions**: Use descriptive assertion messages

## Resources

- [Bats Documentation](https://bats-core.readthedocs.io/)
- [Bats-Assert Library](https://github.com/bats-core/bats-assert)
- [Bats-Support Library](https://github.com/bats-core/bats-support)

## Next Steps

After validating Phase 0 with these tests, proceed to Phase 1 with confidence that the intervention protocol is solid and well-tested.
