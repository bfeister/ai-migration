/**
 * Shared TypeScript interfaces for MCP migration tools
 */

// ==========================================
// Logging Tool Types
// ==========================================

export interface VisualFeedback {
  similarity_score: number;
  differences: string[];
  recommendations: string[];
}

export interface LogMigrationProgressArgs {
  subplan_id: string; // e.g., "subplan-01-02" or "01-02" (normalized)
  status: 'success' | 'failed'; // Only log on completion (success/fail)
  summary: string; // What was done (e.g., "Implemented hero layout")
  source_screenshot_url: string; // SFRA baseline URL
  target_screenshot_url: string; // Storefront Next result URL
  commit_sha: string; // Git commit hash (proof of work)
  duration_seconds?: number; // Auto-calculated if not provided
  error_message?: string; // If status === "failed"
  visual_feedback?: VisualFeedback; // Optional visual comparison feedback
}

export interface LogMigrationProgressResult {
  success: boolean;
  log_path: string;
  message?: string;
  error?: string;
}

// ==========================================
// Server Health Check Tool Types
// ==========================================

export interface CheckServerHealthArgs {
  url: string; // Full URL: "http://localhost:5173"
  path?: string; // Optional path: "/" (default), "/api/health", etc.
  timeout_seconds?: number; // Default: 30
  retry_interval_seconds?: number; // Default: 1 (poll interval)
  expected_status_codes?: number[]; // Default: [200, 201, 204, 301, 302, 304]
  build_log_file?: string; // Optional: Path to build log (e.g., "/tmp/dev-server.log")
}

export interface BuildStatus {
  has_errors: boolean;
  has_warnings: boolean;
  errors: string[];
  warnings: string[];
}

export interface CheckServerHealthResult {
  healthy: boolean; // False if server down OR build errors
  server_responding: boolean; // HTTP check result
  url_checked: string; // Full URL that was checked
  response_time_ms: number; // Time until first success
  status_code?: number; // HTTP status code (if reached server)
  attempts: number; // Number of attempts made
  build_status?: BuildStatus; // Only present if build_log_file provided
  error?: string; // Error message if unhealthy
}

// ==========================================
// Screenshot Tool Types
// ==========================================

export interface CaptureDualScreenshotsArgs {
  feature_id: string; // e.g., "01-homepage-hero"
  subplan_id: string; // e.g., "subplan-01-02"
  sfra_url?: string; // Optional, looked up from url-mappings.json if not provided
  target_url?: string; // Optional, defaults to localhost:5173
  viewport?: { width: number; height: number };
  source_config?: Record<string, any>; // dismiss_consent, wait_for_selector, etc.
  target_config?: Record<string, any>;
}

export interface ScreenshotMetadata {
  path: string;
  size_bytes: number;
  url: string;
}

export interface CaptureDualScreenshotsResult {
  success: boolean;
  source_screenshot: ScreenshotMetadata;
  target_screenshot: ScreenshotMetadata;
  timestamp: string;
  error?: string;
}

// ==========================================
// Git Tool Types
// ==========================================

export interface CommitMigrationProgressArgs {
  subplan_id: string; // e.g., "subplan-01-02"
  title: string; // e.g., "Document existing homepage implementation"
  files_changed?: string[]; // Optional, auto-detected with git status if not provided
  include_screenshots?: boolean; // Default: false (screenshots typically too large)
}

export interface CommitMigrationProgressResult {
  success: boolean;
  commit_hash: string;
  files_changed: string[];
  commit_message: string;
  error?: string;
}

// ==========================================
// Navigation Tool Types
// ==========================================

export interface GetNextMicroPlanArgs {
  feature_directory?: string; // e.g., "01-homepage-content", optional
}

export interface GetNextMicroPlanResult {
  found: boolean;
  subplan_id: string; // e.g., "subplan-01-03"
  file_path: string; // Full path to .md file
  title: string; // Extracted from markdown
  content: string; // Full markdown content
  feature_directory: string; // e.g., "01-homepage-content"
  previous_subplan: string; // e.g., "subplan-01-02"
}

// ==========================================
// Config/Mapping Tool Types
// ==========================================

export interface ParseURLMappingArgs {
  feature_id: string; // e.g., "01-homepage-hero"
}

export interface ParseURLMappingResult {
  found: boolean;
  feature_id: string;
  feature_name: string;
  sfra_url: string;
  target_url: string;
  viewport: { width: number; height: number };
  source_config: Record<string, any>; // dismiss_consent, wait_for_selector, etc.
  target_config: Record<string, any>;
}

// ==========================================
// Intervention Tool Types
// ==========================================

export interface RequestUserInterventionArgs {
  worker_id: string;
  question: string;
  options: string[];
  context?: string;
}

// ==========================================
// Migration Log Structure
// ==========================================

export interface MigrationLogHeader {
  started: string; // ISO 8601 timestamp
  status: string; // e.g., "🔄 In Progress"
  completed: number;
  total: number;
  current_feature: string;
}

export interface MigrationLogEntry {
  timestamp: string; // ISO 8601
  subplan_id: string;
  title?: string;
  status: 'success' | 'failed';
  duration?: string; // e.g., "4m 23s"
  summary: string;
  source_screenshot_url: string;
  target_screenshot_url: string;
  commit_sha: string;
  error_message?: string;
}
