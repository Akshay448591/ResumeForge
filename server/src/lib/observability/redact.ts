/**
 * Redaction utility for protecting Personally Identifiable Information (PII)
 * and sensitive security credentials in application logs and diagnostic outputs.
 */

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// Standard E.164 and common national phone formats: +1-555-123-4567, (555) 123-4567, 555.123.4567, 555-123-4567
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
// Social Security Number format: 000-00-0000
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
// Credit card format: 16 digits grouped in 4s
const CREDIT_CARD_REGEX = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;
// Bearer authorization token
const BEARER_REGEX = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;
// JSON Web Token pattern
const JWT_REGEX = /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g;
// MongoDB connection string with credentials
const MONGO_URI_REGEX = /(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@)/gi;

const SENSITIVE_KEY_REGEX = new RegExp(
  '^(password|token|secret|jwt|cookie|authorization|apikey|key|credentials|creditcard|ssn|socialsecurity|cvv|dob|dateofbirth|phone|phonenumber|email|address|snapshot)$',
  'i',
);

/**
 * Sanitizes any raw string by replacing personal and sensitive patterns with redaction placeholders.
 */
export function redactString(text: string): string {
  if (!text) return text;

  let sanitized = text;

  // Mask credentials and secrets first
  sanitized = sanitized.replace(MONGO_URI_REGEX, '$1***$3');
  sanitized = sanitized.replace(BEARER_REGEX, 'Bearer [REDACTED_TOKEN]');
  sanitized = sanitized.replace(JWT_REGEX, '[REDACTED_JWT]');

  // Redact personal information (PII)
  sanitized = sanitized.replace(EMAIL_REGEX, '[REDACTED_EMAIL]');
  sanitized = sanitized.replace(PHONE_REGEX, '[REDACTED_PHONE]');
  sanitized = sanitized.replace(SSN_REGEX, '[REDACTED_SSN]');
  sanitized = sanitized.replace(CREDIT_CARD_REGEX, '[REDACTED_CARD]');

  return sanitized;
}

/**
 * Recursively walks an object, array, or primitive and redacts PII and sensitive keys.
 */
export function redactPersonalData<T>(data: T, maxDepth = 10): T {
  if (data === null || data === undefined) return data;
  if (maxDepth <= 0) return '[MAX_DEPTH_EXCEEDED]' as unknown as T;

  if (typeof data === 'string') {
    return redactString(data) as unknown as T;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (data instanceof Error) {
    const redactedErr = new Error(redactString(data.message));
    redactedErr.name = data.name;
    if (data.stack) {
      redactedErr.stack = redactString(data.stack);
    }
    return redactedErr as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactPersonalData(item, maxDepth - 1)) as unknown as T;
  }

  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactPersonalData(val, maxDepth - 1);
      }
    }
    return result as unknown as T;
  }

  return data;
}
