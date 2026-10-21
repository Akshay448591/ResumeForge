import type {
  Analysis,
  BulletAssist,
  Comparison as JobComparison,
  Keyword,
  Report,
  Suggestion,
  Tailoring,
} from '../types/tailor';
import type {
  Resume,
  ResumeContent,
  ResumeSummary,
  ImportPreview,
  CompareResult,
  ExportJob,
  PageSizeId,
  StyleOverrides,
  TemplateId,
  User,
  VersionMeta,
} from '../types/resume';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors?: Record<string, string[] | undefined>,
    /** The full error body, e.g. `{ code: 'REV_CONFLICT', currentRev }`. */
    public data?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.message ?? 'Something went wrong.',
      data?.fieldErrors,
      data ?? undefined,
    );
  }
  return data as T;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  me: () => request<User>('/auth/me'),
  register: (b: { name: string; email: string; password: string }) =>
    request<User>('/auth/register', { method: 'POST', body: json(b) }),
  login: (b: { email: string; password: string }) =>
    request<User>('/auth/login', { method: 'POST', body: json(b) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  updateProfile: (b: { name: string }) =>
    request<User>('/auth/me', { method: 'PATCH', body: json(b) }),
  changePassword: (b: { currentPassword: string; newPassword: string }) =>
    request<void>('/auth/me/password', { method: 'POST', body: json(b) }),

  listResumes: () => request<ResumeSummary[]>('/resumes'),
  getResume: (id: string) => request<Resume>(`/resumes/${id}`),
  createResume: (b: {
    title: string;
    templateId: TemplateId;
    content?: ResumeContent;
    style?: StyleOverrides;
  }) => request<Resume>('/resumes', { method: 'POST', body: json(b) }),
  updateResume: (
    id: string,
    b: {
      title?: string;
      templateId?: TemplateId;
      content?: ResumeContent;
      style?: StyleOverrides;
      baseRev?: number;
    },
  ) => request<Resume>(`/resumes/${id}`, { method: 'PATCH', body: json(b) }),
  duplicateResume: (id: string, title?: string) =>
    request<ResumeSummary>(`/resumes/${id}/duplicate`, { method: 'POST', body: json({ title }) }),
  deleteResume: (id: string) => request<void>(`/resumes/${id}`, { method: 'DELETE' }),

  listVersions: (id: string) =>
    request<{ limit: number; versions: VersionMeta[] }>(`/resumes/${id}/versions`),
  createVersion: (id: string, name: string) =>
    request<VersionMeta>(`/resumes/${id}/versions`, { method: 'POST', body: json({ name }) }),
  renameVersion: (id: string, vid: string, name: string) =>
    request<VersionMeta>(`/resumes/${id}/versions/${vid}`, {
      method: 'PATCH',
      body: json({ name }),
    }),
  deleteVersion: (id: string, vid: string) =>
    request<void>(`/resumes/${id}/versions/${vid}`, { method: 'DELETE' }),
  restoreVersion: (id: string, vid: string, baseRev: number) =>
    request<Resume>(`/resumes/${id}/versions/${vid}/restore`, {
      method: 'POST',
      body: json({ baseRev }),
    }),
  compare: (from: string, to: string) =>
    request<CompareResult>(
      `/resumes/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  copySections: (
    id: string,
    b: { fromResumeId: string; sectionIds: string[]; mode: 'append' | 'replace'; baseRev: number },
  ) =>
    request<{ resume: Resume; report: string[] }>(`/resumes/${id}/copy-sections`, {
      method: 'POST',
      body: json(b),
    }),

  createExport: (id: string, b: { pageSize?: PageSizeId; filename?: string }) =>
    request<ExportJob>(`/resumes/${id}/exports`, { method: 'POST', body: json(b) }),
  getExport: (id: string, jobId: string) => request<ExportJob>(`/resumes/${id}/exports/${jobId}`),
  /** Download a finished PDF. */
  downloadExport: async (id: string, jobId: string, filename: string) => {
    let res: Response;
    try {
      res = await fetch(
        `/api/resumes/${id}/exports/${jobId}/download?filename=${encodeURIComponent(filename)}`,
        {
          credentials: 'include',
        },
      );
    } catch {
      throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
    }
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      throw new ApiError(res.status, d?.message ?? 'The download failed. Please try again.');
    }
    return res.blob();
  },

  tailorStatus: () => request<{ aiConfigured: boolean; model: string | null }>('/tailor/status'),
  analyzeJob: (jobDescription: string) =>
    request<Analysis>('/tailor/analyze', { method: 'POST', body: json({ jobDescription }) }),
  compareJob: (resumeId: string, keywords: Keyword[]) =>
    request<JobComparison>('/tailor/compare', {
      method: 'POST',
      body: json({ resumeId, keywords }),
    }),
  startTailoring: (b: {
    resumeId: string;
    jobDescription: string;
    jobTitle: string;
    company: string;
    keywords: Keyword[];
    comparison: JobComparison | null;
    title?: string;
  }) =>
    request<{ resumeId: string; tailoring: Tailoring }>('/tailor/start', {
      method: 'POST',
      body: json(b),
    }),
  improveBullet: (b: {
    text: string;
    role?: string;
    company?: string;
    evidence?: { question: string; answer: string }[];
    jobKeywords?: string[];
  }) => request<BulletAssist>('/tailor/improve-bullet', { method: 'POST', body: json(b) }),
  getTailoring: (id: string) =>
    request<{ tailoring: Tailoring | null; source: { id: string; title: string } | null }>(
      `/resumes/${id}/tailoring`,
    ),
  saveKeywords: (id: string, keywords: Keyword[]) =>
    request<Tailoring>(`/resumes/${id}/tailoring/keywords`, {
      method: 'PUT',
      body: json({ keywords }),
    }),
  recompare: (id: string) =>
    request<JobComparison>(`/resumes/${id}/tailoring/compare`, { method: 'POST' }),
  generateSuggestions: (id: string) =>
    request<{ suggestions: Suggestion[]; warnings: string[] }>(
      `/resumes/${id}/tailoring/suggestions`,
      { method: 'POST' },
    ),
  decideSuggestion: (
    id: string,
    sid: string,
    b: {
      status: Suggestion['status'];
      finalText?: string;
      verified?: boolean;
      undo?: Suggestion['undo'];
    },
  ) =>
    request<Suggestion>(`/resumes/${id}/tailoring/suggestions/${sid}`, {
      method: 'PATCH',
      body: json(b),
    }),
  saveReport: (id: string) =>
    request<{
      report: Report;
      reportHistory: Tailoring['reportHistory'];
      originalAvailable: boolean;
    }>(`/resumes/${id}/tailoring/report`, { method: 'POST' }),

  /** Structured JSON backup of one resume. */
  exportResume: async (id: string) => {
    let res: Response;
    try {
      res = await fetch(`/api/resumes/${id}/export`, { credentials: 'include' });
    } catch {
      throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
    }
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      throw new ApiError(res.status, d?.message ?? 'The export failed. Please try again.');
    }
    const filename = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1];
    return { blob: await res.blob(), filename: filename ?? 'resume.resumeforge.json' };
  },

  /** Parse a .docx into resume sections for review. Nothing is saved yet. */
  importDocx: async (file: File): Promise<ImportPreview> => {
    let res: Response;
    try {
      res = await fetch('/api/import/docx', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': DOCX_MIME },
        body: file,
      });
    } catch {
      throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data?.message ?? 'We couldn’t import that file.');
    return data as ImportPreview;
  },
};

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Save a blob as a file download. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
