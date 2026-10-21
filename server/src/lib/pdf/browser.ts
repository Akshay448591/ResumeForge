import { chromium, type Browser } from 'playwright';

let browser: Promise<Browser> | null = null;

/**
 * One shared Chromium for all exports. It starts on first use and restarts if it ever crashes.
 * Optional environment variables:
 *   CHROMIUM_PATH  use an existing Chrome/Chromium instead of Playwright's download
 *   CHROMIUM_ARGS  extra launch flags, separated by spaces (for example "--no-sandbox" inside Docker)
 */
export function getBrowser(): Promise<Browser> {
  if (!browser) {
    const extra = (process.env.CHROMIUM_ARGS ?? '').split(/\s+/).filter(Boolean);
    const launching = chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--font-render-hinting=none', ...extra],
    });
    browser = launching;
    launching
      .then((b) => b.on('disconnected', () => (browser = null)))
      .catch(() => (browser = null));
  }
  return browser;
}

export async function closeBrowser() {
  const current = browser;
  browser = null;
  if (current) await (await current.catch(() => null))?.close().catch(() => undefined);
}
