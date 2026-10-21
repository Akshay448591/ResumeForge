import { Schema, model, type Types } from 'mongoose';
import type { Comparison, Keyword, Report, Suggestion } from '../lib/tailor/types.js';

export interface ITailoring {
  userId: Types.ObjectId;
  /** The tailored copy this belongs to. One tailoring per resume. */
  resumeId: Types.ObjectId;
  /** The resume it was tailored from. Left untouched. */
  sourceResumeId: Types.ObjectId | null;
  jobDescription: string;
  jobTitle: string;
  company: string;
  keywords: Keyword[];
  comparison: Comparison | null;
  suggestions: Suggestion[];
  report: Report | null;
  /** Short log of earlier saved reports so progress can be seen. */
  reportHistory: { savedAt: Date; matched: number; partial: number; missing: number }[];
}

const tailoringSchema = new Schema<ITailoring>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    resumeId: { type: Schema.Types.ObjectId, ref: 'Resume', required: true, unique: true },
    sourceResumeId: { type: Schema.Types.ObjectId, ref: 'Resume', default: null },
    jobDescription: { type: String, required: true, maxlength: 20000 },
    jobTitle: { type: String, default: '', maxlength: 200 },
    company: { type: String, default: '', maxlength: 200 },
    keywords: { type: Schema.Types.Mixed, default: [] },
    comparison: { type: Schema.Types.Mixed, default: null },
    suggestions: { type: Schema.Types.Mixed, default: [] },
    report: { type: Schema.Types.Mixed, default: null },
    reportHistory: {
      type: [{ savedAt: Date, matched: Number, partial: Number, missing: Number }],
      default: [],
    },
  },
  { timestamps: true, minimize: false },
);

export const Tailoring = model<ITailoring>('Tailoring', tailoringSchema);
