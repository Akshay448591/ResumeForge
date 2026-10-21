import { describe, expect, it } from 'vitest';
import { bulletHints } from '../../src/lib/tailor/bullet.js';
import { runComparison } from '../../src/lib/tailor/compare.js';
import { numbersIn, unsupportedNumbers } from '../../src/lib/tailor/guard.js';
import { experienceYears, phraseIn } from '../../src/lib/tailor/match.js';
import { buildReport } from '../../src/lib/tailor/report.js';
import type { Keyword } from '../../src/lib/tailor/types.js';
import { sampleContent } from '../fixtures.js';

describe('38. Unit Testing - Job-description Matching and Quality Checks', () => {
  describe('phraseIn keyword matching', () => {
    it('matches exact keywords with proper word boundary recognition', () => {
      expect(phraseIn('Python', 'Senior Python Developer with FastAPI expertise')).toBe(true);
      expect(phraseIn('Java', 'Modern JavaScript developer')).toBe(false);
      expect(phraseIn('C', 'Wrote C++ services')).toBe(false);
    });

    it('recognizes common tech abbreviations and aliases', () => {
      expect(phraseIn('JavaScript', 'Expert in JS, HTML, and CSS')).toBe(true);
      expect(phraseIn('TypeScript', 'Fullstack engineer using TS and React')).toBe(true);
      expect(phraseIn('Kubernetes', 'Managed K8s deployment pipelines')).toBe(true);
      expect(phraseIn('Node.js', 'Built microservices using Node')).toBe(true);
      expect(phraseIn('PostgreSQL', 'Optimized Postgres queries')).toBe(true);
    });

    it('is case-insensitive for standard terminology', () => {
      expect(phraseIn('docker', 'Built containerized services with Docker')).toBe(true);
      expect(phraseIn('AWS', 'Deployed on aws cloud')).toBe(true);
    });
  });

  describe('experience duration calculations', () => {
    it('calculates total years of experience without double-counting overlaps', () => {
      const c = sampleContent();
      // Job 1: 2020-01 to 2022-12 (3 years)
      c.experience[0].startDate = '2020-01';
      c.experience[0].endDate = '2022-12';
      c.experience[0].current = false;
      // Job 2 overlaps: 2022-01 to 2023-12 (extends by 1 year, 2020 through end of 2023 = 4 years total)
      c.experience[1].startDate = '2022-01';
      c.experience[1].endDate = '2023-12';
      c.experience[1].current = false;

      const years = experienceYears(c, new Date('2024-01-01'));
      expect(years).toBeCloseTo(4, 0);
    });

    it('handles ongoing / current job calculations up to the reference date', () => {
      const c = sampleContent();
      c.experience = [
        {
          id: 'exp-1',
          company: 'Acme',
          role: 'Engineer',
          location: 'Pune',
          startDate: '2022-01',
          endDate: '',
          current: true,
          bullets: [],
        },
      ];
      const years = experienceYears(c, new Date('2024-01-01'));
      expect(years).toBeCloseTo(2, 0);
    });
  });

  describe('hallucination and metric guards', () => {
    it('extracts numbers and percentages correctly', () => {
      const nums = numbersIn('Cut checkout latency by 35% and increased throughput by 2.5x with 10 engineers');
      expect(nums).toContain('35%');
      expect(nums).toContain('2.5x');
      expect(nums).toContain('10');
    });

    it('flags unsupported numbers introduced by AI that were not in the original bullet', () => {
      const original = 'Improved database query performance and response times.';
      const suggested = 'Improved database query performance by 40% and saved $50,000 annually.';

      const unsupported = unsupportedNumbers(suggested, original);
      expect(unsupported).toContain('40%');
      expect(unsupported).toContain('50000');
    });

    it('passes when AI suggestion only uses numbers present in original source', () => {
      const original = 'Reduced latencies by 30% across 5 services.';
      const suggested = 'Achieved 30% latency reduction across 5 microservices.';

      const unsupported = unsupportedNumbers(suggested, original);
      expect(unsupported).toHaveLength(0);
    });
  });

  describe('bullet quality checks and suggestions', () => {
    it('detects missing quantifiable metrics in resume bullets', () => {
      const hints = bulletHints('Helped the team with backend services and bug fixes.');
      expect(hints.some((h) => h.toLowerCase().includes('metric') || h.toLowerCase().includes('number'))).toBe(true);
    });

    it('flags weak or passive opening verbs', () => {
      const hints = bulletHints('Responsible for managing database backups.');
      expect(
        hints.some(
          (h) =>
            h.toLowerCase().includes('action') ||
            h.toLowerCase().includes('lead') ||
            h.toLowerCase().includes('strong') ||
            h.toLowerCase().includes('verb'),
        ),
      ).toBe(true);
    });

    it('accepts strong action-oriented bullets with metrics', () => {
      const hints = bulletHints('Architected high-throughput payment pipeline cutting latency by 45%.');
      expect(hints.filter((h) => h.includes('metric'))).toHaveLength(0);
    });
  });

  describe('ATS match report & quality score calculation', () => {
    it('calculates keyword coverage and overall match score', async () => {
      const content = sampleContent();
      const keywords: Keyword[] = [
        {
          id: 'k1',
          term: 'Node.js',
          category: 'technology',
          importance: 'required',
          quote: 'Must know Node.js',
          included: true,
        },
        {
          id: 'k2',
          term: 'TypeScript',
          category: 'technology',
          importance: 'required',
          quote: 'TypeScript required',
          included: true,
        },
        {
          id: 'k3',
          term: 'Rust',
          category: 'technology',
          importance: 'preferred',
          quote: 'Rust is a plus',
          included: true,
        },
      ];

      const comparison = await runComparison(content, keywords);
      const report = buildReport({
        jobTitle: 'Senior Backend Engineer',
        company: 'Cloud Corp',
        keywords,
        content,
        original: null,
        comparison,
        suggestions: [],
      });

      expect(report.counts.total).toBe(3);
      expect(report.matched.some((m) => m.term === 'Node.js')).toBe(true);
      expect(report.missing.some((m) => m.term === 'Rust')).toBe(true);
      expect(report.checklist.length).toBeGreaterThan(0);
      expect(report.checklist.some((c) => c.id === 'required')).toBe(true);
    });
  });
});
