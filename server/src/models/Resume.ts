import { Schema, model, type Types } from 'mongoose';
import {
  LEGACY_TEMPLATES,
  TEMPLATE_IDS,
  type ResumeContent,
  type StyleOverrides,
} from '../schema/resume.js';

export interface IResume {
  userId: Types.ObjectId;
  title: string;
  templateId: (typeof TEMPLATE_IDS)[number];
  content: ResumeContent;
  style: StyleOverrides;
  /** Bumped on every content/design save, restore or section copy. Guards against stale writes. */
  rev: number;
  /** The resume this one was duplicated from, if any. */
  variantOf: Types.ObjectId | null;
}

const resumeSchema = new Schema<IResume>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    templateId: {
      type: String,
      enum: [...TEMPLATE_IDS, ...Object.keys(LEGACY_TEMPLATES)],
      default: 'professional',
    },
    content: { type: Schema.Types.Mixed, required: true },
    style: { type: Schema.Types.Mixed, default: {} },
    rev: { type: Number, default: 0 },
    variantOf: { type: Schema.Types.ObjectId, ref: 'Resume', default: null },
  },
  { timestamps: true, minimize: false },
);

export const Resume = model<IResume>('Resume', resumeSchema);
