import mongoose from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { summarize, type Snapshot } from '../../src/lib/diff.js';
import {
  MAX_VERSIONS,
  createVersion,
  snapshotOf,
  toVersionMeta,
} from '../../src/lib/versions.js';
import { ResumeVersion } from '../../src/models/ResumeVersion.js';
import { emptyContent, newId } from '../../src/schema/resume.js';
import { sampleContent } from '../fixtures.js';

describe('38. Unit Testing - Version Creation and Restoration', () => {
  describe('snapshotOf & toVersionMeta', () => {
    it('creates a proper Snapshot structure', () => {
      const snap = snapshotOf({
        templateId: 'modern',
        content: sampleContent(),
        style: { margin: 40 },
      });
      expect(snap.templateId).toBe('modern');
      expect(snap.content.personal.fullName).toBe('Priya Nair');
      expect(snap.style.margin).toBe(40);
    });

    it('formats version metadata with normalized template and string id', () => {
      const meta = toVersionMeta({
        _id: new mongoose.Types.ObjectId(),
        name: 'V1 Initial',
        kind: 'manual',
        note: 'Before big changes',
        templateId: 'classic', // legacy template
        summary: ['Updated summary', 'Switched template to professional'],
        createdAt: new Date(),
      } as any);

      expect(meta.name).toBe('V1 Initial');
      expect(meta.kind).toBe('manual');
      expect(meta.templateId).toBe('professional'); // normalized
      expect(meta.summary).toHaveLength(2);
    });
  });

  describe('diff and summarize', () => {
    it('returns "First saved version" if previous snapshot is null', () => {
      const curr: Snapshot = {
        templateId: 'modern',
        content: sampleContent(),
        style: {},
      };
      const summary = summarize(null, curr);
      expect(summary).toEqual(['First saved version']);
    });

    it('detects changes in summary, template, and experience', () => {
      const prev: Snapshot = {
        templateId: 'ats',
        content: sampleContent(),
        style: {},
      };
      const newContent = structuredClone(sampleContent());
      newContent.summary = 'Completely rewritten executive summary for director role.';
      newContent.experience.push({
        id: newId(),
        company: 'New Venture Tech',
        role: 'Tech Lead',
        location: 'Bangalore',
        startDate: '2024-01',
        endDate: '',
        current: true,
        bullets: [{ id: newId(), text: 'Led platform engineering team' }],
      });

      const curr: Snapshot = {
        templateId: 'professional',
        content: newContent,
        style: { accent: '#1F3A5F' },
      };

      const changes = summarize(prev, curr);
      expect(changes.some((c) => c.toLowerCase().includes('summary') || c.toLowerCase().includes('template'))).toBe(true);
      expect(changes.length).toBeGreaterThan(0);
    });
  });

  describe('version retention rules (MAX_VERSIONS)', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('enforces MAX_VERSIONS limit of 10 and drops oldest unnamed version when capacity reached', async () => {
      const resumeId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      vi.spyOn(ResumeVersion, 'findOne').mockReturnValue({
        sort: () => ({
          lean: () => Promise.resolve(null),
        }),
      } as any);

      // Suppose count is 10 (at limit)
      vi.spyOn(ResumeVersion, 'countDocuments').mockResolvedValue(MAX_VERSIONS as any);

      const deleteMock = vi.fn().mockResolvedValue({});
      // An unnamed oldest version exists
      vi.spyOn(ResumeVersion, 'findOne').mockImplementation(((query: any) => {
        if (query?.$or) {
          return {
            sort: () =>
              Promise.resolve({
                _id: 'oldest-auto-id',
                deleteOne: deleteMock,
              }),
          };
        }
        return {
          sort: () => ({
            lean: () => Promise.resolve(null),
          }),
        };
      }) as any);

      const createMock = vi.spyOn(ResumeVersion, 'create').mockResolvedValue({
        _id: 'new-version-id',
        name: 'New Snapshot',
      } as any);

      await createVersion(
        {
          _id: resumeId,
          userId,
          templateId: 'modern',
          content: sampleContent(),
        },
        { name: 'New Snapshot', kind: 'manual' },
      );

      // Verify oldest unnamed version was pruned
      expect(deleteMock).toHaveBeenCalledTimes(1);
      expect(createMock).toHaveBeenCalledTimes(1);
    });

    it('throws 409 conflict when limit reached and all existing versions are named', async () => {
      const resumeId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      vi.spyOn(ResumeVersion, 'countDocuments').mockResolvedValue(MAX_VERSIONS as any);
      // No unnamed oldest version found
      vi.spyOn(ResumeVersion, 'findOne').mockImplementation(((query: any) => {
        if (query?.$or) {
          return {
            sort: () => Promise.resolve(null),
          };
        }
        return {
          sort: () => ({
            lean: () => Promise.resolve(null),
          }),
        };
      }) as any);

      await expect(
        createVersion(
          {
            _id: resumeId,
            userId,
            templateId: 'modern',
            content: sampleContent(),
          },
          { name: 'Another Named Snapshot', kind: 'manual' },
        ),
      ).rejects.toThrowError(/You can keep up to 10 versions and all of them are named/);
    });
  });
});
