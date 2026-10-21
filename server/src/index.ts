import mongoose from 'mongoose';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { closeBrowser } from './lib/pdf/browser.js';
import { recoverStaleExports } from './lib/pdf/queue.js';

async function main() {
  try {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  } catch (err) {
    console.error(
      '\nCould not connect to MongoDB at',
      env.MONGODB_URI,
      '\nMake sure MongoDB is installed and running locally (see README, step 3).\n',
    );
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
  console.log('Connected to MongoDB');
  await recoverStaleExports();
  const server = createApp().listen(env.PORT, () =>
    console.log(`API listening on http://localhost:${env.PORT}`),
  );

  const shutdown = () => {
    server.close();
    void closeBrowser().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();
