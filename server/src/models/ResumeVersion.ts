import { Schema, model, type Types } from 'mongoose';
import type { ResumeContent, StyleOverrides } from '../schema/resume.js';

export interface IResumeVersion {
  resumeId: Types.ObjectId;
  userId: Types.ObjectId;
  /** Empty for automatic backups. A named version is protected from automatic clean-up. */
  name: string;
  kind: 'manual' | 'auto';
  note: string;
  templateId: string;
  content: ResumeContent;
  style: StyleOverrides;
  /** Short plain-language list of what changed since the previous version. */
  summary: string[];
}

const versionSchema = new Schema<IResumeVersion>(
  {
    resumeId: { type: Schema.Types.ObjectId, ref: 'Resume', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, default: '', trim: true, maxlength: 80 },
    kind: { type: String, enum: ['manual', 'auto'], required: true },
    note: { type: String, default: '', maxlength: 200 },
    templateId: { type: String, required: true },
    content: { type: Schema.Types.Mixed, required: true },
    style: { type: Schema.Types.Mixed, default: {} },
    summary: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);
versionSchema.index({ resumeId: 1, createdAt: -1 });

export const ResumeVersion = model<IResumeVersion>('ResumeVersion', versionSchema);
