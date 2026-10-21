import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isPrivateOrReservedIp,
  maskSensitive,
  resolveSafePath,
  sanitizeFilename,
  validateSafeUrl,
} from '../../src/lib/security.js';
import { contentSchema, emptyContent } from '../../src/schema/resume.js';

describe('Security Hardening - Unit Tests', () => {
  describe('File Path & Filename Sanitization', () => {
    it('strips directory traversal sequences from filenames', () => {
      const malicious = '../../../../etc/passwd';
      const clean = sanitizeFilename(malicious);
      expect(clean).not.toContain('..');
      expect(clean).not.toContain('/');
      expect(clean).not.toContain('\\');
      expect(clean).toBe('etcpasswd.pdf');
    });

    it('strips null bytes, control characters, and reserved punctuation', () => {
      const bad = 'my\0resume*test?file<name>|1.pdf';
      const clean = sanitizeFilename(bad);
      expect(clean).toBe('myresumetestfilename1.pdf');
    });

    it('defuses Windows reserved device names', () => {
      expect(sanitizeFilename('CON')).toBe('CON_file.pdf');
      expect(sanitizeFilename('prn')).toBe('prn_file.pdf');
      expect(sanitizeFilename('AUX')).toBe('AUX_file.pdf');
      expect(sanitizeFilename('nul')).toBe('nul_file.pdf');
      expect(sanitizeFilename('com1')).toBe('com1_file.pdf');
    });

    it('falls back to sanitized fallback or Resume.pdf when input is stripped', () => {
      expect(sanitizeFilename('   ')).toBe('Resume.pdf');
      expect(sanitizeFilename('///..///', 'Candidate')).toBe('Candidate.pdf');
    });

    it('resolves safe relative paths and blocks directory traversal', () => {
      const base = path.resolve('c:/Users/hp/Desktop/resumeforge/client/dist');
      const safe = resolveSafePath(base, 'assets/style.css');
      expect(safe.startsWith(base)).toBe(true);

      // Traversal attempt
      expect(() => resolveSafePath(base, '../../../../windows/system32')).toThrow(
        /Invalid or unsafe file path/,
      );
    });
  });

  describe('SSRF Protection & Safe URL Validation', () => {
    it('detects private and reserved IPv4 addresses', () => {
      expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('10.0.1.50')).toBe(true);
      expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('172.31.255.255')).toBe(true);
      expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true);
      expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true); // AWS/cloud metadata
      expect(isPrivateOrReservedIp('0.0.0.0')).toBe(true);
      expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false); // public Google DNS
      expect(isPrivateOrReservedIp('93.184.216.34')).toBe(false); // example.com
    });

    it('detects private and loopback IPv6 addresses', () => {
      expect(isPrivateOrReservedIp('::1')).toBe(true);
      expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
      expect(isPrivateOrReservedIp('fc00::1')).toBe(true);
      expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('2607:f8b0:4005:805::200e')).toBe(false); // public Google IPv6
    });

    it('blocks internal hosts, loopback, and cloud metadata URLs', () => {
      expect(validateSafeUrl('http://127.0.0.1/admin').safe).toBe(false);
      expect(validateSafeUrl('http://localhost:4000/api').safe).toBe(false);
      expect(validateSafeUrl('http://169.254.169.254/latest/meta-data/').safe).toBe(false);
      expect(validateSafeUrl('http://metadata.google.internal/computeMetadata').safe).toBe(false);
      expect(validateSafeUrl('http://192.168.0.1/router').safe).toBe(false);
    });

    it('rejects dangerous protocols (file, gopher, ftp, javascript, data)', () => {
      expect(validateSafeUrl('file:///etc/passwd').safe).toBe(false);
      expect(validateSafeUrl('gopher://evil.com').safe).toBe(false);
      expect(validateSafeUrl('ftp://files.com').safe).toBe(false);
      expect(validateSafeUrl('javascript:alert(1)').safe).toBe(false);
      expect(validateSafeUrl('data:text/html,test').safe).toBe(false);
    });

    it('rejects URLs with embedded credentials', () => {
      expect(validateSafeUrl('http://admin:secret@example.com').safe).toBe(false);
    });

    it('allows safe public HTTP and HTTPS URLs', () => {
      expect(validateSafeUrl('https://example.com/api/data').safe).toBe(true);
      expect(validateSafeUrl('https://api.github.com/users/jordan').safe).toBe(true);
    });
  });

  describe('Sensitive Data Masking in Logs', () => {
    it('masks password, token, and secret fields in objects', () => {
      const data = {
        name: 'Jordan',
        email: 'jordan@example.com',
        password: 'SuperSecretPassword!',
        token: 'auth-token-12345',
        jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature',
        nested: {
          apiKey: 'AIzaSySecretApiKey',
          publicInfo: 'Safe info',
        },
      };

      const masked = maskSensitive(data) as any;
      expect(masked.name).toBe('Jordan');
      expect(masked.email).toBe('jordan@example.com');
      expect(masked.password).toBe('***[REDACTED]***');
      expect(masked.token).toBe('***[REDACTED]***');
      expect(masked.nested.apiKey).toBe('***[REDACTED]***');
      expect(masked.nested.publicInfo).toBe('Safe info');
    });

    it('masks MongoDB URI credentials in log strings', () => {
      const uri = 'mongodb+srv://admin_user:P%40ssw0rd123@cluster0.abc.mongodb.net/resumeforge';
      const clean = maskSensitive(uri);
      expect(clean).not.toContain('P%40ssw0rd123');
      expect(clean).toContain('mongodb+srv://admin_user:***@cluster0.abc.mongodb.net/resumeforge');
    });
  });

  describe('Resume Schema Input Validation & Protocol Hardening', () => {
    it('rejects dangerous javascript: or data: protocols in links', () => {
      const c = emptyContent();
      c.personal.links = [
        { id: 'l1', label: 'Exploit', url: 'javascript:alert(document.cookie)', visible: true },
      ];
      const res = contentSchema.safeParse(c);
      expect(res.success).toBe(false);
    });

    it('rejects dangerous protocols in project and certification links', () => {
      const c = emptyContent();
      c.projects = [
        { id: 'p1', name: 'Malicious', link: 'data:text/html,<script>alert(1)</script>', technologies: [], description: '' },
      ];
      expect(contentSchema.safeParse(c).success).toBe(false);

      c.projects = [];
      c.certifications = [
        { id: 'c1', name: 'Cert', issuer: 'Issuer', date: '2024', link: 'file:///etc/shadow' },
      ];
      expect(contentSchema.safeParse(c).success).toBe(false);
    });

    it('accepts safe URLs in links and projects', () => {
      const c = emptyContent();
      c.personal.links = [
        { id: 'l1', label: 'GitHub', url: 'https://github.com/myusername', visible: true },
        { id: 'l2', label: 'Portfolio', url: 'portfolio.dev', visible: true },
      ];
      expect(contentSchema.safeParse(c).success).toBe(true);
    });
  });
});
