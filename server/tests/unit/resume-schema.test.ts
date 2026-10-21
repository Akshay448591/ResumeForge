import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  SECTION_TYPES,
  TEMPLATE_IDS,
  completion,
  contentSchema,
  emptyContent,
  newId,
  normalizeTemplateId,
  styleSchema,
} from '../../src/schema/resume.js';
import { sampleContent } from '../fixtures.js';

describe('38. Unit Testing - Resume Schema Validation', () => {
  it('validates a complete, standard resume content document', () => {
    const sample = sampleContent();
    const parsed = contentSchema.safeParse(sample);
    expect(parsed.success).toBe(true);
  });

  it('validates default emptyContent()', () => {
    const empty = emptyContent();
    const parsed = contentSchema.safeParse(empty);
    expect(parsed.success).toBe(true);
    expect(empty.schemaVersion).toBe(SCHEMA_VERSION);
    expect(empty.sections).toHaveLength(8);
  });

  it('enforces schemaVersion to match SCHEMA_VERSION', () => {
    const data = sampleContent();
    // @ts-expect-error test wrong version
    data.schemaVersion = 999;
    const result = contentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('enforces personal info length limits and link bounds', () => {
    const data = sampleContent();
    data.personal.fullName = 'A'.repeat(121);
    expect(contentSchema.safeParse(data).success).toBe(false);

    data.personal.fullName = 'Valid Name';
    data.personal.title = 'B'.repeat(121);
    expect(contentSchema.safeParse(data).success).toBe(false);

    data.personal.title = 'Valid Title';
    data.personal.email = 'C'.repeat(201);
    expect(contentSchema.safeParse(data).success).toBe(false);

    data.personal.email = 'test@example.com';
    data.personal.links = Array.from({ length: 11 }, (_, i) => ({
      id: newId(),
      label: `Link ${i}`,
      url: `https://example.com/${i}`,
      visible: true,
    }));
    expect(contentSchema.safeParse(data).success).toBe(false);
  });

  it('enforces summary character limits', () => {
    const data = sampleContent();
    data.summary = 'S'.repeat(1501);
    expect(contentSchema.safeParse(data).success).toBe(false);

    data.summary = 'S'.repeat(1500);
    expect(contentSchema.safeParse(data).success).toBe(true);
  });

  it('enforces experience limits and bullet constraints', () => {
    const data = sampleContent();
    data.experience[0].bullets = Array.from({ length: 16 }, (_, i) => ({
      id: newId(),
      text: `Bullet ${i}`,
    }));
    expect(contentSchema.safeParse(data).success).toBe(false);

    data.experience[0].bullets = [
      { id: newId(), text: 'X'.repeat(501) },
    ];
    expect(contentSchema.safeParse(data).success).toBe(false);
  });

  it('enforces skill type enum and item limits', () => {
    const data = sampleContent();
    // @ts-expect-error invalid skill kind
    data.skills.push({ id: newId(), name: 'Invalid', kind: 'magic' });
    expect(contentSchema.safeParse(data).success).toBe(false);
  });

  describe('styleSchema validation', () => {
    it('accepts valid 6-digit hex colors and font options', () => {
      const validStyle = {
        accent: '#2F55D4',
        fontFamily: 'instrument',
        fontSize: 12,
        lineHeight: 1.4,
        margin: 48,
        sectionSpacing: 16,
        headingStyle: 'underline',
        dividerStyle: 'dotted',
        layout: 'single',
        pageMode: 'multi',
        pageSize: 'a4',
      };
      const result = styleSchema.safeParse(validStyle);
      expect(result.success).toBe(true);
    });

    it('rejects invalid hex colors', () => {
      expect(styleSchema.safeParse({ accent: 'blue' }).success).toBe(false);
      expect(styleSchema.safeParse({ accent: '#123' }).success).toBe(false);
      expect(styleSchema.safeParse({ accent: '#1234567' }).success).toBe(false);
      expect(styleSchema.safeParse({ accent: 'rgb(0,0,0)' }).success).toBe(false);
    });

    it('rejects out-of-range numerical dimensions', () => {
      expect(styleSchema.safeParse({ fontSize: 7 }).success).toBe(false);
      expect(styleSchema.safeParse({ fontSize: 17 }).success).toBe(false);
      expect(styleSchema.safeParse({ lineHeight: 1.0 }).success).toBe(false);
      expect(styleSchema.safeParse({ lineHeight: 2.1 }).success).toBe(false);
      expect(styleSchema.safeParse({ margin: 10 }).success).toBe(false);
      expect(styleSchema.safeParse({ margin: 100 }).success).toBe(false);
      expect(styleSchema.safeParse({ sectionSpacing: 2 }).success).toBe(false);
      expect(styleSchema.safeParse({ sectionSpacing: 50 }).success).toBe(false);
    });

    it('strictly forbids unknown properties in styleSchema', () => {
      const result = styleSchema.safeParse({ unknownProp: 123 });
      expect(result.success).toBe(false);
    });
  });

  describe('normalizeTemplateId', () => {
    it('preserves recognized template IDs', () => {
      for (const tid of TEMPLATE_IDS) {
        expect(normalizeTemplateId(tid)).toBe(tid);
      }
    });

    it('maps legacy template names to modern equivalents', () => {
      expect(normalizeTemplateId('classic')).toBe('professional');
      expect(normalizeTemplateId('compact')).toBe('ats');
    });

    it('falls back to professional for unknown templates', () => {
      expect(normalizeTemplateId('funky-template')).toBe('professional');
      expect(normalizeTemplateId('')).toBe('professional');
    });
  });

  describe('completion calculation', () => {
    it('returns empty status for fresh blank content', () => {
      const blank = emptyContent();
      const res = completion(blank);
      expect(res.percent).toBe(0);
      expect(res.status).toBe('empty');
    });

    it('returns in-progress status for partially filled content', () => {
      const partial = emptyContent();
      partial.personal.fullName = 'Jane Doe';
      partial.personal.email = 'jane@example.com';
      partial.personal.title = 'Frontend Developer';
      const res = completion(partial);
      expect(res.percent).toBeGreaterThan(0);
      expect(res.percent).toBeLessThan(100);
      expect(res.status).toBe('in-progress');
    });

    it('returns complete status when all criteria are satisfied', () => {
      const sample = sampleContent();
      const res = completion(sample);
      expect(res.percent).toBe(100);
      expect(res.status).toBe('complete');
    });
  });
});
