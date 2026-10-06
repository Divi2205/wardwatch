# WardWatch: Neighbourhood Issue Reporter

Residents report local problems (potholes, dead streetlights, garbage, water leaks, blocked drains) with a description, category, map location and photo. Ward officers work through an urgency-sorted queue, setting status, priority and remarks. A public dashboard shows issue counts by category and status, and how fast each kind of problem actually gets fixed.

**Stack:** React (frontend) · Node.js + Express (database connectivity layer) · MySQL (database). HTML, CSS and JavaScript throughout.

Browsers can't connect to MySQL directly, so `server.js` and the files in `routes/` are the connectivity layer. They're written in JavaScript, take requests from the React app, run SQL, and send back JSON.

### Everything the project uses

| Part | What | Why |
|---|---|---|
| Frontend | React 18, built with Vite | Components, hooks, context, controlled forms |
| | React Router | Page URLs like `/issues/12` without full page reloads |
| | Leaflet + react-leaflet | Maps (tiles from OpenStreetMap, free, no API key) |
| | Chart.js + react-chartjs-2 | Dashboard charts |
| | Fontsource (Barlow) | Fonts bundled with the app, so no Google Fonts call |
| Server | Express | Routes, JSON, serving the React build |
| | mysql2 | The MySQL connection |
| | express-session, bcryptjs | Logins and password hashing |
| | multer | Photo uploads |
| | dotenv | Reads settings from `.env` |
| Dev only | concurrently | Runs the server and React together with one command |

Only the map tiles need internet at demo time; everything else is bundled.

---

## Setup

You need **Node.js 18+** and **MySQL 8** (or MariaDB 10.5+) installed.

1. **Install packages** (this installs the server and the React app):
   ```
   npm install
   ```
2. **Create the database.** This creates the `wardwatch` database and all tables. It deletes any existing `wardwatch` database.
   ```
   mysql -u root -p < db/schema.sql
   ```
3. **Configure.** Copy `.env.example` to `.env` and put in your MySQL password.
4. **Load demo data** (accounts plus 28 realistic issues at different stages):
   ```
   npm run seed
   ```
5. **Run it.** Pick one:
   - **While developing:** `npm run dev`, then open http://localhost:5173. React reloads instantly when you edit a file.
   - **For the demo:** `npm run build`, then `npm start`, then open http://localhost:3000. This is the optimised build.

### Demo accounts (created by the seed script)

| Role | Email | Password |
|---|---|---|
| Ward officer (admin) | officer@wardwatch.local | Officer@123 |
| Citizen | priya@example.com | Citizen@123 |
| Citizen | arjun@example.com | Citizen@123 |

Four more citizens (fathima, karthik, meena, rahul @example.com) use the same password. New sign-ups are always citizens; admins only come from the seed script.

---

## How the requirements are met

| Requirement | Where |
|---|---|
| Issue submission (description, category) | `Report.jsx`, `POST /api/issues` |
| Location | Leaflet map: tap to pin, drag to adjust, or "Use my location" (browser GPS). Stored as latitude/longitude |
| Photo | Uploaded with Multer to `/uploads`, path stored in MySQL (never the image itself) |
| Admin assigns status | Officer queue drawer. Only valid next steps are offered, and the server enforces them (`lib/workflow.js`) |
| Admin assigns priority | Same drawer, pre-filled with the system's suggestion |
| Admin remarks | Same drawer, shown publicly on the issue page. Required when rejecting |
| Dashboard: counts by category and status | `Dashboard.jsx`: stacked bar chart plus a full count table, from `GET /api/stats/dashboard` (`GROUP BY category_code, status`) |

## What makes it different

1. **Automatic triage.** Each report gets a score from its category, danger words in the text ("child", "accident", "live wire", "sewage"…), how many neighbours back it, reopenings and overdue time. The score becomes a *suggested* priority (dashed outline). The officer confirms or overrides it. Rules are in `lib/triage.js`.
2. **"Me too" instead of duplicates.** While reporting, the app checks for open issues of the same category within 150 m (haversine distance in SQL). Residents can back the existing report, which raises its priority, instead of filing a duplicate.
3. **Citizen-confirmed resolution.** "Resolved" by the officer isn't the end. The reporter confirms the fix (→ closed) or reopens it with a reason (→ back in the queue, higher priority). Unanswered resolutions auto-close after 7 days.
4. **Target times and escalation.** Every category has a target fix time (e.g. water leakage 2 days, potholes 7 days). A background check every 15 minutes escalates overdue issues and raises their priority. The dashboard shows average fix time against target per category.
5. **Full audit trail.** Every change (who, what, when) is stored in `issue_history` and shown as a timeline on each issue.

---

## Status workflow

```
submitted ──► acknowledged ──► in_progress ──► resolved ──► closed
    │               │                ▲             │    (reporter confirms,
    └───────┬───────┘                │             │     or auto after 7 days)
            ▼                        │             ▼
        rejected               reopened ◄──── reporter says not fixed
   (remark required)
```

## Database (MySQL)

| Table | Purpose |
|---|---|
| `users` | Citizens and officers. Passwords hashed with bcrypt |
| `categories` | Category name, triage weight, target fix time (hours) |
| `issues` | The reports: text, location, photo path, status, priority, suggested priority, score, counts, timestamps |
| `issue_supporters` | Who backed which issue ("me too"). One row per person per issue |
| `issue_history` | Audit trail of every change. `actor_id` NULL means the system did it |

## API

| Method & route | Who | Does |
|---|---|---|
| `POST /api/auth/register`, `/login`, `/logout`, `GET /me` | Anyone | Accounts and sessions |
| `GET /api/issues` | Anyone | List with filters `status`, `category`, `open=1`, `mine=1` |
| `GET /api/issues/nearby` | Anyone | Duplicate check within 150 m |
| `GET /api/issues/:id` | Anyone | One issue plus its history |
| `POST /api/issues` | Logged in | Report an issue (multipart, optional photo) |
| `POST /api/issues/:id/support` | Logged in | "Me too" |
| `POST /api/issues/:id/confirm`, `/reopen` | Reporter | Accept or reject the fix |
| `GET /api/admin/queue` | Officer | Urgency-sorted queue |
| `PATCH /api/admin/issues/:id` | Officer | Change status, priority, remarks |
| `GET /api/stats/dashboard` | Anyone | All dashboard numbers |

## Project structure

```
wardwatch/
├── server.js              Express app: /api routes, serves the React build, runs escalation
├── db.js                  MySQL connection pool
├── db/
│   ├── schema.sql         Tables and categories
│   └── seed.js            Demo accounts and issues
├── lib/                   auth guards, triage scoring, status rules, async helper
├── routes/                auth, issues, admin, stats (all the SQL lives here)
├── uploads/               Uploaded photos
└── client/                The React app
    ├── vite.config.js     Dev server on 5173, forwards /api to Express on 3000
    └── src/
        ├── main.jsx       Entry point: providers, fonts, styles
        ├── App.jsx        Routes (one per page)
        ├── api.js         fetch helper for every backend call
        ├── utils.js       Labels, colours, formatting
        ├── hooks.js       useCategories()
        ├── styles.css     All styling
        ├── context/       AuthContext (logged-in user), ToastContext (messages)
        ├── components/    Header, RequireAuth, Badges, IssueTicket, MapParts
        └── pages/         Home, Report, IssueDetail, MyReports, AdminQueue, Dashboard, Login
```

## React concepts used (useful for the viva)

| Concept | Where |
|---|---|
| `useState` | Every form and filter, e.g. `Report.jsx`, `AdminQueue.jsx` |
| `useEffect` | Loading data when filters change, the duplicate check in `Report.jsx` |
| `useContext` + Context | `AuthContext` shares the logged-in user; `ToastContext` shares messages |
| Custom hook | `useCategories()` in `hooks.js` |
| `useCallback`, `useRef`, `useMemo` | `AdminQueue.jsx`, `Home.jsx` |
| `forwardRef` | `StatusPin` in `MapParts.jsx`, so Home can open a pin's popup |
| Props and composition | `IssueTicket`, `StatusBadge`, `PriorityTag` reused across pages |
| Controlled forms | All inputs keep their value in state |
| Conditional rendering | `Actions` in `IssueDetail.jsx` shows different buttons per viewer |
| Protected routes | `RequireAuth.jsx` wraps pages that need login or the officer role |
| `key` to reset state | The officer drawer resets when a different issue is selected |

## Suggested team split

| Member | Owns |
|---|---|
| 1 | Database, connectivity layer, auth, report page (`db/`, `db.js`, `routes/auth.js`, `routes/issues.js`, `AuthContext.jsx`, `Report.jsx`, `Login.jsx`) |
| 2 | Officer workflow and triage (`routes/admin.js`, `lib/workflow.js`, `lib/triage.js`, `AdminQueue.jsx`, `IssueDetail.jsx`) |
| 3 | Dashboard, map home, presentation (`routes/stats.js`, `Dashboard.jsx`, `Home.jsx`, `MyReports.jsx`, `MapParts.jsx`) |
