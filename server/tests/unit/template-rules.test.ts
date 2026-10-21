import { describe, expect, it } from 'vitest';
import {
  FONTS,
  HEADING_STYLES,
  DIVIDER_STYLES,
  TEMPLATES,
  getTemplate,
  resolveStyle,
} from '../../../client/src/lib/templates.js';
import type { TemplateId } from '../../../client/src/types/resume.js';

describe('38. Unit Testing - Template Rendering Rules', () => {
  it('defines all five supported templates with expected configuration', () => {
    const expectedIds: TemplateId[] = ['ats', 'professional', 'modern', 'minimal', 'academic'];
    const ids = TEMPLATES.map((t) => t.id);
    expect(ids).toEqual(expectedIds);
  });

  describe('template specific rules', () => {
    it('ats template enforces single column, plain caps heading, and no name accent', () => {
      const ats = getTemplate('ats');
      expect(ats.layouts).toEqual(['single']);
      expect(ats.headerAlign).toBe('left');
      expect(ats.nameAccent).toBe(false);
      expect(ats.defaults.fontFamily).toBe('arial');
      expect(ats.defaults.headingStyle).toBe('caps');
    });

    it('professional template centers header, enables name accent, and supports two-column', () => {
      const prof = getTemplate('professional');
      expect(prof.headerAlign).toBe('center');
      expect(prof.nameAccent).toBe(true);
      expect(prof.layouts).toContain('single');
      expect(prof.layouts).toContain('two-column');
      expect(prof.defaults.fontFamily).toBe('georgia');
      expect(prof.defaults.headingStyle).toBe('underline');
    });

    it('modern template has cobalt accent, accent-bar headings, and supports two-column', () => {
      const modern = getTemplate('modern');
      expect(modern.headerAlign).toBe('left');
      expect(modern.nameAccent).toBe(true);
      expect(modern.layouts).toContain('two-column');
      expect(modern.defaults.accent).toBe('#2F55D4');
      expect(modern.defaults.headingStyle).toBe('accent-bar');
    });

    it('minimal template enforces light style, spacious margins, and single column', () => {
      const min = getTemplate('minimal');
      expect(min.layouts).toEqual(['single']);
      expect(min.defaults.headingStyle).toBe('plain');
      expect(min.defaults.margin).toBe(60);
    });

    it('academic template enforces Times font, underline headings, and single column', () => {
      const acad = getTemplate('academic');
      expect(acad.layouts).toEqual(['single']);
      expect(acad.defaults.fontFamily).toBe('times');
      expect(acad.defaults.headingStyle).toBe('underline');
    });
  });

  describe('resolveStyle layout and override rules', () => {
    it('applies user style overrides over template defaults', () => {
      const resolved = resolveStyle('modern', {
        accent: '#1F3A5F',
        fontSize: 14,
        margin: 40,
      });

      expect(resolved.accent).toBe('#1F3A5F');
      expect(resolved.fontSize).toBe(14);
      expect(resolved.margin).toBe(40);
      // Keeps unmodified defaults
      expect(resolved.fontFamily).toBe('instrument');
    });

    it('falls back to single column when two-column is requested on templates that do not support it', () => {
      // ats only supports single
      const atsResolved = resolveStyle('ats', { layout: 'two-column' });
      expect(atsResolved.layout).toBe('single');

      // minimal only supports single
      const minResolved = resolveStyle('minimal', { layout: 'two-column' });
      expect(minResolved.layout).toBe('single');

      // academic only supports single
      const acadResolved = resolveStyle('academic', { layout: 'two-column' });
      expect(acadResolved.layout).toBe('single');

      // modern supports two-column
      const modResolved = resolveStyle('modern', { layout: 'two-column' });
      expect(modResolved.layout).toBe('two-column');

      // professional supports two-column
      const profResolved = resolveStyle('professional', { layout: 'two-column' });
      expect(profResolved.layout).toBe('two-column');
    });

    it('ignores undefined overrides and preserves template defaults', () => {
      const resolved = resolveStyle('professional', { accent: undefined });
      expect(resolved.accent).toBe('#1F3A5F');
    });
  });

  describe('font, heading, and divider definitions', () => {
    it('provides standard font stacks with fallbacks', () => {
      expect(FONTS.instrument.stack).toContain('Instrument Sans Variable');
      expect(FONTS.arial.stack).toContain('Arial');
      expect(FONTS.georgia.stack).toContain('Georgia');
      expect(FONTS.times.stack).toContain('Times New Roman');
    });

    it('includes all heading styles and divider styles', () => {
      const headingIds = HEADING_STYLES.map((h) => h.id);
      expect(headingIds).toEqual(['underline', 'caps', 'accent-bar', 'plain', 'band']);

      const dividerIds = DIVIDER_STYLES.map((d) => d.id);
      expect(dividerIds).toEqual(['none', 'thin', 'dotted', 'thick', 'accent']);
    });
  });
});
