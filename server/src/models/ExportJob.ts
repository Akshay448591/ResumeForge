import { Schema, model, type Types } from 'mongoose';

export interface IExportJob {
  userId: Types.ObjectId;
  resumeId: Types.ObjectId;
  /** Fingerprint of what is being rendered. Used to avoid duplicate work. */
  hash: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  error: string;
  pageSize: 'a4' | 'letter';
  filename: string;
  pages: number | null;
  bytes: number | null;
  /** The resume as it was when the export was requested, so later edits can't change a running job. */
  snapshot?: {
    title: string;
    templateId: string;
    style: Record<string, unknown>;
    content: unknown;
  };
  pdf?: Buffer;
  expiresAt: Date;
}

const exportJobSchema = new Schema<IExportJob>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    resumeId: { type: Schema.Types.ObjectId, ref: 'Resume', required: true, index: true },
    hash: { type: String, required: true },
    status: { type: String, enum: ['queued', 'processing', 'done', 'failed'], default: 'queued' },
    error: { type: String, default: '' },
    pageSize: { type: String, enum: ['a4', 'letter'], default: 'a4' },
    filename: { type: String, default: '' },
    pages: { type: Number, default: null },
    bytes: { type: Number, default: null },
    snapshot: { type: Schema.Types.Mixed, select: false },
    pdf: { type: Buffer, select: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, minimize: false },
);
exportJobSchema.index({ resumeId: 1, hash: 1, createdAt: -1 });
// Finished PDFs are temporary: MongoDB removes the job (and its file) after `expiresAt`.
exportJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ExportJob = model<IExportJob>('ExportJob', exportJobSchema);
