/**
 * Input validation utilities for API endpoints.
 *
 * Provides type-safe validation for common request body patterns.
 * Returns structured errors for 400 responses.
 */

// ── Types ──────────────────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors?: ValidationError[];
}

// ── Validators ─────────────────────────────────────────────────────

export function validateString(value: unknown, field: string, opts?: {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
}): ValidationError | null {
  if (value === undefined || value === null || value === "") {
    if (opts?.required) return { field, message: `${field} is required` };
    return null;
  }

  if (typeof value !== "string") {
    return { field, message: `${field} must be a string` };
  }

  if (opts?.minLength && value.length < opts.minLength) {
    return { field, message: `${field} must be at least ${opts.minLength} characters` };
  }

  if (opts?.maxLength && value.length > opts.maxLength) {
    return { field, message: `${field} must be at most ${opts.maxLength} characters` };
  }

  if (opts?.pattern && !opts.pattern.test(value)) {
    return { field, message: `${field} has invalid format` };
  }

  return null;
}

export function validateEnum(value: unknown, field: string, allowed: string[], required = false): ValidationError | null {
  if (value === undefined || value === null) {
    if (required) return { field, message: `${field} is required` };
    return null;
  }

  if (typeof value !== "string" || !allowed.includes(value)) {
    return { field, message: `${field} must be one of: ${allowed.join(", ")}` };
  }

  return null;
}

export function validateArray(value: unknown, field: string, opts?: {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  itemType?: string;
}): ValidationError | null {
  if (value === undefined || value === null) {
    if (opts?.required) return { field, message: `${field} is required` };
    return null;
  }

  if (!Array.isArray(value)) {
    return { field, message: `${field} must be an array` };
  }

  if (opts?.minLength && value.length < opts.minLength) {
    return { field, message: `${field} must have at least ${opts.minLength} item(s)` };
  }

  if (opts?.maxLength && value.length > opts.maxLength) {
    return { field, message: `${field} must have at most ${opts.maxLength} item(s)` };
  }

  if (opts?.itemType) {
    for (let i = 0; i < value.length; i++) {
      if (typeof value[i] !== opts.itemType) {
        return { field, message: `${field}[${i}] must be a ${opts.itemType}` };
      }
    }
  }

  return null;
}

// ── Sanitization ───────────────────────────────────────────────────

/**
 * Sanitize a string to prevent XSS in HTML contexts.
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sanitize a file path to prevent directory traversal.
 */
export function sanitizePath(input: string): string {
  return input
    .replace(/\.\./g, "")  // Remove path traversal
    .replace(/^\/+/, "")    // Remove leading slashes
    .replace(/\0/g, "");    // Remove null bytes
}

/**
 * Validate a URL (must be http or https).
 */
export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// ── Batch validation helper ────────────────────────────────────────

export function validate(...checks: Array<ValidationError | null>): ValidationResult<void> {
  const errors = checks.filter((e): e is ValidationError => e !== null);
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true };
}
