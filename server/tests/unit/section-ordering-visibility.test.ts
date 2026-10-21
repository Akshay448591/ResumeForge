import { describe, expect, it } from 'vitest';
import {
  SECTION_TYPES,
  contentSchema,
  emptyContent,
  newId,
  type ResumeContent,
} from '../../src/schema/resume.js';
import { sampleContent } from '../fixtures.js';

describe('38. Unit Testing - Section Ordering and Visibility', () => {
  it('provides default sections with valid types and visible: true', () => {
    const c = emptyContent();
    expect(c.sections).toHaveLength(8);
    for (const sec of c.sections) {
      expect(SECTION_TYPES).toContain(sec.type);
      expect(sec.visible).toBe(true);
    }
  });

  it('allows custom section ordering and preserves order in schema', () => {
    const c = sampleContent();
    // Reorder: put skills first, then summary, then experience
    c.sections = [
      { id: 'skills', type: 'skills', visible: true },
      { id: 'summary', type: 'summary', visible: true },
      { id: 'experience', type: 'experience', visible: true },
      { id: 'education', type: 'education', visible: true },
    ];
    const parsed = contentSchema.parse(c);
    expect(parsed.sections[0].type).toBe('skills');
    expect(parsed.sections[1].type).toBe('summary');
    expect(parsed.sections[2].type).toBe('experience');
    expect(parsed.sections[3].type).toBe('education');
  });

  it('allows hiding individual sections with visible: false', () => {
    const c = sampleContent();
    c.sections = c.sections.map((s) =>
      s.type === 'awards' || s.type === 'certifications' ? { ...s, visible: false } : s,
    );
    const parsed = contentSchema.parse(c);
    const hidden = parsed.sections.filter((s) => !s.visible);
    expect(hidden.map((s) => s.type)).toEqual(['certifications', 'awards']);

    const visibleSections = parsed.sections.filter((s) => s.visible);
    expect(visibleSections.find((s) => s.type === 'certifications')).toBeUndefined();
    expect(visibleSections.find((s) => s.type === 'awards')).toBeUndefined();
    expect(visibleSections.find((s) => s.type === 'experience')).toBeDefined();
  });

  it('supports custom title overrides on sections', () => {
    const c = sampleContent();
    c.sections = c.sections.map((s) =>
      s.type === 'experience' ? { ...s, title: 'Work History & Roles' } : s,
    );
    const parsed = contentSchema.parse(c);
    const expSec = parsed.sections.find((s) => s.type === 'experience');
    expect(expSec?.title).toBe('Work History & Roles');
  });

  it('supports custom sections defined in content.custom', () => {
    const c = sampleContent();
    const customId = newId();
    c.custom = [
      {
        id: customId,
        title: 'Open Source Contributions',
        items: [
          {
            id: newId(),
            heading: 'Core Maintainer',
            description: 'Maintained popular Node.js library with 1M monthly downloads.',
          },
        ],
      },
    ];
    c.sections.push({
      id: customId,
      type: 'custom',
      visible: true,
      title: 'Open Source',
    });

    const parsed = contentSchema.parse(c);
    expect(parsed.custom).toHaveLength(1);
    expect(parsed.custom[0].title).toBe('Open Source Contributions');
    expect(parsed.sections.some((s) => s.type === 'custom' && s.id === customId)).toBe(true);
  });

  it('rejects invalid section types', () => {
    const c = sampleContent();
    // @ts-expect-error test unknown section type
    c.sections.push({ id: newId(), type: 'hobbies_and_games', visible: true });
    expect(contentSchema.safeParse(c).success).toBe(false);
  });

  it('safely filters visible sections for rendering without mutating underlying data', () => {
    const c = sampleContent();
    // Hide experience
    const expSection = c.sections.find((s) => s.type === 'experience');
    if (expSection) expSection.visible = false;

    const visible = c.sections.filter((s) => s.visible);
    expect(visible.some((s) => s.type === 'experience')).toBe(false);
    // Underlying experience data remains intact
    expect(c.experience.length).toBeGreaterThan(0);
  });
});
