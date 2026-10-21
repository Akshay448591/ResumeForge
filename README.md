# ResumeForge

A resume-building web app. This MVP covers **Milestone 1** (layout, dashboard, document model) and **Milestone 2** (editor sections and live preview).

## Tech stack

| Area       | Used in this MVP                                                           |
| ---------- | -------------------------------------------------------------------------- |
| Frontend   | React 18, TypeScript, Vite                                                 |
| Styling    | Tailwind CSS, reusable components in `client/src/components/ui`            |
| State      | TanStack Query (server state), Redux Toolkit (editor draft, notifications) |
| Backend    | Node.js, Express, TypeScript                                               |
| Database   | MongoDB (local) with Mongoose                                              |
| Auth       | Email + password, JWT in an httpOnly cookie, bcrypt                        |
| Validation | Zod (server schema), advisory checks in the client                         |
| Tooling    | ESLint, Prettier, `tsc` type checking                                      |

Not in this MVP (planned later): PDF export (Playwright), AI writing, payments, tests, Docker/CI, observability.

## What you need to install

1. **Node.js 20 or newer** (https://nodejs.org). Check with `node -v`. npm comes with it.
2. **MongoDB Community Server** running locally (https://www.mongodb.com/try/download/community).
   - Windows: run the installer and keep "Install MongoDB as a Service" ticked. It starts automatically.
   - macOS: `brew tap mongodb/brew && brew install mongodb-community && brew services start mongodb-community`
   - Linux (Ubuntu/Debian): follow the official install guide, then `sudo systemctl start mongod`
   - Optional: **MongoDB Compass** (a GUI to look at your data).

## Run it (5 steps)

```bash
# 1. Unzip and open the folder
cd resumeforge

# 2. Install all dependencies (client + server)
npm install

# 3. Create your environment file
cp server/.env.example server/.env        # Windows: copy server\.env.example server\.env
#    Open server/.env and replace JWT_SECRET with any long random string (16+ characters).

# 4. Make sure MongoDB is running (see above). Quick check: run `mongosh` and see it connect.

# 5. Start the app (API on :4000, web app on :5173)
npm run dev
```

Open **http://localhost:5173**, click **Get started**, create an account, then create your first resume.

## Useful commands

| Command             | What it does                                                                      |
| ------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`       | Start API and web app together with hot reload                                    |
| `npm run typecheck` | TypeScript check for client and server                                            |
| `npm run lint`      | ESLint across the repo                                                            |
| `npm run format`    | Prettier, rewrites files                                                          |
| `npm run build`     | Production build of server and client                                             |
| `npm start`         | Run the built server (set `NODE_ENV=production`; it also serves the built client) |

## Configuration (`server/.env`)

| Variable      | Default                                 | Notes                                              |
| ------------- | --------------------------------------- | -------------------------------------------------- |
| `PORT`        | `4000`                                  | API port. The Vite dev server proxies `/api` here. |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/resumeforge` | Change if your MongoDB is elsewhere.               |
| `JWT_SECRET`  | none, required                          | At least 16 characters.                            |

## Running with Docker

### Local Multi-Container Setup (Docker Compose)
ResumeForge includes a complete multi-container setup with MongoDB, backend API, and Nginx frontend:

```bash
# Build and start all services (Client on :80, Server on :5000, Mongo on :27017)
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop containers
docker-compose down
```

### Production Single-Container Build
You can also build and run the unified container (which bundles the client and server together with Playwright Chromium):

```bash
docker build -t resumeforge .
docker run -p 10000:10000 -e MONGODB_URI="your-mongodb-uri" -e JWT_SECRET="your-secret" resumeforge
```

---

## Deployment to Render & CI/CD Pipeline

ResumeForge is configured for continuous deployment on [Render](https://render.com) using a single Dockerized Web Service.

### Continuous Deployment via GitHub Actions (Option A)

When you push changes to the `main` branch, the GitHub Actions CI/CD workflow automatically:
1. **Tests & Verifies**: Runs ESLint, TypeScript typecheck, and the full test suite (169 tests).
2. **Validates Docker**: Builds the production Docker image to guarantee container compatibility.
3. **Triggers Render**: Calls your Render Deploy Hook to immediately deploy to your live URL.

#### Setting up the Render Deploy Hook in GitHub:
1. In your **Render Dashboard**, navigate to your Web Service -> **Settings**.
2. Scroll to **Deploy Hook** and copy the unique URL (`https://api.render.com/deploy/srv-xxxx?key=yyyy`).
3. In your **GitHub Repository**, go to **Settings** -> **Secrets and variables** -> **Actions**.
4. Click **New repository secret**:
   - **Name**: `RENDER_DEPLOY_HOOK_URL`
   - **Value**: Paste your Render Deploy Hook URL.
5. Click **Add secret**.
From now on, every `git push origin main` will automatically run all quality checks and deploy directly to your live URL!


## Troubleshooting

- **"Could not connect to MongoDB"**: MongoDB isn't running. Start the service and run `npm run dev` again.
- **Port already in use**: change `PORT` in `server/.env` and the proxy target in `client/vite.config.ts`.
- **Blank page / network errors in the browser**: make sure both servers started (you should see "API listening on http://localhost:4000").
- **Signed out on every refresh in production**: the auth cookie is `secure` in production, so serve over HTTPS.

## What's built

**Layout and navigation**: landing page, dashboard, resume editor, template gallery (4 templates), account settings; responsive layout; reusable Button, Field (Input, Textarea, Select, Checkbox), Dialog, Tooltip, Toast and Spinner components; skip link, visible focus, keyboard-operable controls, inline form validation.

**Dashboard**: lists your resumes with title, template, last modified and completion status. Create, rename, duplicate and delete. Search and sort. Empty state with a guided first-resume flow.

**Resume document model** (`server/src/schema/resume.ts`, mirrored in `client/src/types/resume.ts`): personal details, summary, experience, education, skills, projects, certifications, awards, languages and custom sections. Every repeatable entry has a stable ID. Section order and visibility live in `sections`. `schemaVersion` is stored with the content, and content is kept separate from the template (`templateId`).

**Editor**: personal details with show/hide toggles and links; summary with examples, word and character counts and guidance; work experience (current job, bullets, date checks); education; skills, projects, certifications, awards, languages; custom sections. Reorder, duplicate and remove entries; reorder and hide sections. Empty sections never print. Changes autosave after a short pause.

**Live preview**: updates as you type, A4 page size, zoom, "fit width", page navigation, dashed page-boundary markers, page count, graceful handling of empty fields and long content.

## Design notes

- **Validation**: email, URL and date checks are advisory (amber hints that never block saving), so autosave can't fail mid-typing. The server checks structure and length limits.
- **Auth**: the JWT is in an httpOnly cookie rather than localStorage, so page scripts can't read it.
- **Preview vs. print**: the preview is the same HTML/CSS a future Playwright PDF export will print.

## Project layout

```
client/src/
  components/ui/      reusable UI components
  features/editor/    editor page, forms, live preview, templates
  pages/              landing, auth, dashboard, templates, settings
  store/              Redux Toolkit (editor draft, toasts)
  lib/                API client, validation helpers
server/src/
  schema/resume.ts    resume document schema + completion logic
  models/             Mongoose models (User, Resume)
  routes/             /api/auth and /api/resumes
```
