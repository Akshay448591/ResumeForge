import { env } from '../../config/env.js';
import { ExportJob } from '../../models/ExportJob.js';
import { renderPdf } from './render.js';

/** How many PDFs may render at the same time. Each one is a browser tab, so keep this small. */
const CONCURRENCY = 2;
const waiting: string[] = [];
let active = 0;

export const printBaseUrl = () =>
  env.PRINT_BASE_URL ??
  (env.NODE_ENV === 'production' ? `http://localhost:${env.PORT}` : 'http://localhost:5173');

/** Turn a low-level failure into something a person can act on. The full error is logged. */
export function friendlyError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (/Executable doesn't exist|browserType\.launch|Failed to launch/i.test(text)) {
    return 'PDF export isn’t set up on this server yet. Run “npm run pdf:setup” in the project folder, then try again.';
  }
  if (/ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|net::ERR/i.test(text)) {
    return `The PDF renderer couldn’t reach the app at ${printBaseUrl()}. Make sure the web app is running, or set PRINT_BASE_URL.`;
  }
  if (/Timeout|timed out/i.test(text)) {
    return 'The export took too long. Try again, or shorten the resume.';
  }
  return 'We couldn’t generate the PDF. Please try again.';
}

async function run(id: string) {
  const job = await ExportJob.findOneAndUpdate(
    { _id: id, status: 'queued' },
    { status: 'processing' },
    { new: true },
  ).select('+snapshot');
  if (!job?.snapshot) return;
  try {
    const { pdf, pages } = await renderPdf(job.snapshot, printBaseUrl());
    job.status = 'done';
    job.pdf = pdf;
    job.pages = pages;
    job.bytes = pdf.length;
    job.error = '';
  } catch (err) {
    console.error('PDF export failed:', err);
    job.status = 'failed';
    job.error = friendlyError(err);
  }
  job.snapshot = undefined; // no need to keep the resume copy once rendering is over
  await job.save();
}

function pump() {
  while (active < CONCURRENCY && waiting.length) {
    const id = waiting.shift() as string;
    active++;
    void run(id)
      .catch((e) => console.error('Export job error:', e))
      .finally(() => {
        active--;
        pump();
      });
  }
}

/** Queue an export. Returns immediately; the job record reports progress. */
export function enqueueExport(jobId: string) {
  waiting.push(jobId);
  pump();
}

/** Jobs left running by a previous server process can't finish, so mark them failed. */
export async function recoverStaleExports() {
  await ExportJob.updateMany(
    { status: { $in: ['queued', 'processing'] } },
    {
      status: 'failed',
      error: 'The server restarted while this export was running. Please try again.',
    },
  );
}
