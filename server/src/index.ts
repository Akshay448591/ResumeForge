import mongoose from 'mongoose';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { closeBrowser } from './lib/pdf/browser.js';
import { recoverStaleExports } from './lib/pdf/queue.js';

async function connectWithRetry() {
  const maskedUri = env.MONGODB_URI.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@');
  let retries = 0;
  while (true) {
    try {
      console.log(`[MongoDB] Connecting to ${maskedUri} ...`);
      await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
      console.log('[MongoDB] ✅ Connected to MongoDB successfully.');
      try {
        await recoverStaleExports();
      } catch (err) {
        console.warn('Notice: Stale exports recovery encountered:', err instanceof Error ? err.message : err);
      }
      break;
    } catch (err) {
      retries++;
      console.error(
        `\n❌ [MongoDB] Connection attempt #${retries} failed:`,
        err instanceof Error ? err.message : err,
      );
      console.error('⚠️ If using MongoDB Atlas with Render:');
      console.error('   1. Go to https://cloud.mongodb.com -> Network Access');
      console.error('   2. Click "Add IP Address"');
      console.error('   3. Select "Allow Access From Anywhere" (0.0.0.0/0)');
      console.error('   4. Click Confirm and wait 1 minute for it to become Active.');
      console.error('Retrying connection in 5 seconds...\n');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function main() {
  const port = env.PORT || 10000;
  const server = createApp().listen(port, '0.0.0.0', () => {
    console.log(`🚀 ResumeForge server listening on http://0.0.0.0:${port}`);
  });

  // Connect to MongoDB in background with retry so Render's port detection succeeds immediately
  void connectWithRetry();

  const shutdown = () => {
    console.log('Shutting down server...');
    server.close();
    void closeBrowser().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();
