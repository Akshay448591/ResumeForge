import mongoose from 'mongoose';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { closeBrowser } from './lib/pdf/browser.js';
import { recoverStaleExports } from './lib/pdf/queue.js';

async function main() {
  try {
    const maskedUri = env.MONGODB_URI.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@');
    console.log(`Connecting to MongoDB at ${maskedUri} ...`);
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 30000 });
    console.log('Connected to MongoDB successfully.');
  } catch (err) {
    const maskedUri = env.MONGODB_URI.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@');
    console.error('\n❌ Could not connect to MongoDB at:', maskedUri);
    console.error('Error details:', err instanceof Error ? err.message : err);
    console.error('\n⚠️ If using MongoDB Atlas with Render:');
    console.error('   1. Go to cloud.mongodb.com -> Network Access');
    console.error('   2. Click "Add IP Address"');
    console.error('   3. Add 0.0.0.0/0 ("Allow Access from Anywhere")');
    console.error('   4. Verify database user username and password in MONGODB_URI are correct.\n');
    process.exit(1);
  }

  try {
    await recoverStaleExports();
  } catch (err) {
    console.warn('Notice: Stale exports recovery encountered:', err instanceof Error ? err.message : err);
  }

  const port = env.PORT || 10000;
  const server = createApp().listen(port, '0.0.0.0', () =>
    console.log(`🚀 ResumeForge server listening on http://0.0.0.0:${port}`),
  );

  const shutdown = () => {
    server.close();
    void closeBrowser().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();
