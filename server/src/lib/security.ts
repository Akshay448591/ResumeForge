import net from 'node:net';
import path from 'node:path';
import { AppError } from './errors.js';

/* =========================================================================
   1. Unsafe File Path & Traversal Protection
   ========================================================================= */

const RESERVED_WINDOWS_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

/**
 * Sanitizes a proposed file name to ensure it cannot escape directories or abuse file systems.
 * Strips path separators, directory traversal (".."), null bytes, control characters,
 * and Windows reserved names.
 */
export function sanitizeFilename(raw: string | undefined, fallback = 'Resume'): string {
  let name = (raw ?? '')
    // Remove null bytes and control characters
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, '')
    // Remove slashes and path traversal sequences
    .replace(/[\\/]+/g, '')
    .replace(/\.{2,}/g, '')
    .replace(/[:*?"<>|]+/g, '')
    // Strip leading and trailing dots
    .replace(/^\.+|\.+$/g, '')
    .trim();

  // Strip trailing extension if supplied to re-apply cleanly
  name = name.replace(/\.pdf$/i, '').replace(/^\.+|\.+$/g, '').trim();

  // Guard against Windows device names like CON, PRN, AUX, NUL
  if (RESERVED_WINDOWS_NAMES.has(name.toLowerCase())) {
    name = `${name}_file`;
  }

  // Fallback if empty or stripped completely
  if (!name) {
    name = fallback
      .replace(/[\u0000-\u001f\u007f-\u009f\\/:*?"<>|.]+/g, '')
      .trim() || 'Resume';
  }

  // Enforce maximum length
  return `${name.slice(0, 100)}.pdf`;
}

/**
 * Safely resolves a relative path within a base directory, throwing if directory traversal is detected.
 */
export function resolveSafePath(baseDir: string, relativePath: string): string {
  const safeBase = path.resolve(baseDir);
  const sanitized = relativePath.replace(/\0/g, '');
  const target = path.resolve(safeBase, sanitized);

  const baseWithSep = safeBase.endsWith(path.sep) ? safeBase : safeBase + path.sep;
  if (!target.startsWith(baseWithSep) && target !== safeBase) {
    throw new AppError(400, 'Invalid or unsafe file path.');
  }
  return target;
}

/* =========================================================================
   2. Server-Side Request Forgery (SSRF) Protection & URL Validation
   ========================================================================= */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'instance-data',
  'metadata',
  '169.254.169.254',
]);

/**
 * Checks whether an IP address belongs to private, loopback, link-local, or reserved ranges.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (!net.isIP(ip)) return false;

  // IPv4 checks
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [b0, b1] = parts;

    if (b0 === 0) return true; // 0.0.0.0/8 (current network)
    if (b0 === 10) return true; // 10.0.0.0/8 (private)
    if (b0 === 127) return true; // 127.0.0.0/8 (loopback)
    if (b0 === 169 && b1 === 254) return true; // 169.254.0.0/16 (link-local, cloud metadata)
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true; // 172.16.0.0/12 (private)
    if (b0 === 192 && b1 === 168) return true; // 192.168.0.0/16 (private)
    if (b0 === 100 && b1 >= 64 && b1 <= 127) return true; // 100.64.0.0/10 (carrier NAT)
    if (b0 >= 224) return true; // 224.0.0.0/4 multicast & reserved
    return false;
  }

  // IPv6 checks
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fe90:') || lower.startsWith('fea0:') || lower.startsWith('feb0:')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
  if (lower.startsWith('ff')) return true; // multicast
  if (lower.startsWith('::ffff:')) {
    const v4Part = lower.replace('::ffff:', '');
    if (net.isIPv4(v4Part)) return isPrivateOrReservedIp(v4Part);
  }
  return false;
}

/**
 * Validates whether a target URL is safe for external HTTP requests (preventing SSRF).
 */
export function validateSafeUrl(
  urlString: string,
  options: { allowLocalhost?: boolean } = {},
): { safe: boolean; url?: URL; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: 'Malformed URL.' };
  }

  // Only permit HTTP and HTTPS
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Forbidden URL scheme: ${parsed.protocol}. Only http and https are allowed.` };
  }

  // Forbid credentials in URL
  if (parsed.username || parsed.password) {
    return { safe: false, reason: 'URLs containing embedded credentials are not allowed.' };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (!options.allowLocalhost && BLOCKED_HOSTNAMES.has(hostname)) {
    return { safe: false, reason: `Target host "${hostname}" is restricted.` };
  }

  // Check IP addresses
  if (net.isIP(hostname)) {
    if (!options.allowLocalhost && isPrivateOrReservedIp(hostname)) {
      return { safe: false, reason: `Access to internal IP address "${hostname}" is forbidden.` };
    }
  }

  return { safe: true, url: parsed };
}

/**
 * Safe fetch utility with SSRF protection, redirection validation, timeout, and response size bounds.
 */
export async function safeFetch(
  targetUrl: string,
  init: RequestInit = {},
  options: { allowLocalhost?: boolean; maxBytes?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024; // 2 MB limit
  const timeoutMs = options.timeoutMs ?? 7000;

  const check = validateSafeUrl(targetUrl, { allowLocalhost: options.allowLocalhost });
  if (!check.safe || !check.url) {
    throw new AppError(400, `SSRF Protection: ${check.reason}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(check.url.toString(), {
      ...init,
      signal: controller.signal,
      redirect: 'manual', // Manually validate redirects to prevent redirect SSRF
    });

    // If redirected, re-validate the target location
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new AppError(502, 'Redirect missing location header.');
      const redirectUrl = new URL(location, check.url).toString();
      return safeFetch(redirectUrl, init, options);
    }

    // Check content-length header if provided
    const contentLength = Number(res.headers.get('content-length') ?? 0);
    if (contentLength > maxBytes) {
      throw new AppError(413, `Response exceeded size limit of ${maxBytes} bytes.`);
    }

    return res;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new AppError(504, 'The request timed out.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/* =========================================================================
   3. Sensitive Data Masking & Log Sanitization
   ========================================================================= */

const SENSITIVE_KEYS = new RegExp(
  '^(password|token|secret|jwt|cookie|authorization|apikey|key|credentials|creditcard)$',
  'i',
);

/**
 * Deep masks sensitive fields in objects and connection strings to ensure logs never leak credentials.
 */
export function maskSensitive(data: unknown): unknown {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    // Mask MongoDB URI credentials
    let cleaned = data.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@)/gi, '$1***$3');
    // Mask JWT tokens (header.payload.signature)
    cleaned = cleaned.replace(/eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, '[MASKED_JWT]');
    return cleaned;
  }

  if (Array.isArray(data)) {
    return data.map((item) => maskSensitive(item));
  }

  if (typeof data === 'object') {
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(key)) {
        masked[key] = '***[REDACTED]***';
      } else {
        masked[key] = maskSensitive(value);
      }
    }
    return masked;
  }

  return data;
}
