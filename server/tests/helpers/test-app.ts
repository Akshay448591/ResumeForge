import http from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { ExportJob } from '../../src/models/ExportJob.js';
import { Resume } from '../../src/models/Resume.js';
import { ResumeVersion } from '../../src/models/ResumeVersion.js';
import { User } from '../../src/models/User.js';

let dbConnected = false;

export async function ensureDbConnected() {
  if (dbConnected && mongoose.connection.readyState === 1) return;
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  dbConnected = true;
}

export interface TestResponse<T = unknown> {
  status: number;
  headers: Headers;
  body: T;
  rawText: string;
}

export class TestClient {
  public cookies: Record<string, string> = {};

  constructor(private baseUrl: string) {}

  public setCookie(name: string, value: string) {
    this.cookies[name] = value;
  }

  public clearCookies() {
    this.cookies = {};
  }

  private cookieHeader(): string {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  private captureCookies(res: Response) {
    const rawSetCookie = res.headers.get('set-cookie');
    if (!rawSetCookie) return;
    // Simple cookie parser for single or comma/newline delimited set-cookie
    const parts = rawSetCookie.split(/,(?=\s*[^;=]+=[^;=]+)/);
    for (const cookieStr of parts) {
      const match = cookieStr.match(/^\s*([^=;]+)=([^;]*)/);
      if (match) {
        const [, key, val] = match;
        if (val === '' || /expires=Thu, 01 Jan 1970/i.test(cookieStr) || /max-age=0/i.test(cookieStr)) {
          delete this.cookies[key];
        } else {
          this.cookies[key] = val;
        }
      }
    }
  }

  async request<T = unknown>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      rawBody?: Buffer;
      contentType?: string;
      headers?: Record<string, string>;
    } = {},
  ): Promise<TestResponse<T>> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = { ...options.headers };

    const cookieHdr = this.cookieHeader();
    if (cookieHdr) {
      headers['cookie'] = cookieHdr;
    }

    let bodyData: BodyInit | undefined;
    if (options.rawBody) {
      bodyData = options.rawBody;
      if (options.contentType) headers['content-type'] = options.contentType;
    } else if (options.body !== undefined) {
      bodyData = JSON.stringify(options.body);
      headers['content-type'] = 'application/json';
    }

    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: bodyData,
    });

    this.captureCookies(res);

    const rawText = await res.text();
    let body: unknown = rawText;
    try {
      body = JSON.parse(rawText);
    } catch {
      // plain text or binary
    }

    return {
      status: res.status,
      headers: res.headers,
      body: body as T,
      rawText,
    };
  }

  get<T = unknown>(path: string, headers?: Record<string, string>) {
    return this.request<T>(path, { method: 'GET', headers });
  }

  post<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>(path, { method: 'POST', body, headers });
  }

  patch<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>(path, { method: 'PATCH', body, headers });
  }

  put<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>(path, { method: 'PUT', body, headers });
  }

  delete<T = unknown>(path: string, headers?: Record<string, string>) {
    return this.request<T>(path, { method: 'DELETE', headers });
  }
}

export interface TestServerInstance {
  server: http.Server;
  url: string;
  client: TestClient;
  createClient: () => TestClient;
  close: () => Promise<void>;
  cleanupUser: (userId: string) => Promise<void>;
}

export async function createTestServer(): Promise<TestServerInstance> {
  await ensureDbConnected();

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;

  const createClient = () => new TestClient(url);

  const cleanupUser = async (userId: string) => {
    if (!userId) return;
    const resumes = await Resume.find({ userId }).select('_id');
    const resumeIds = resumes.map((r) => r._id);
    await ResumeVersion.deleteMany({ resumeId: { $in: resumeIds } });
    await ExportJob.deleteMany({ userId });
    await Resume.deleteMany({ userId });
    await User.deleteMany({ _id: userId });
  };

  const close = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  return {
    server,
    url,
    client: createClient(),
    createClient,
    close,
    cleanupUser,
  };
}
