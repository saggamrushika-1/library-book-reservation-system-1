# Library Book Reservation System

A beginner-friendly catalogue and reservation app for a small college library. Readers can search the catalogue and ask to reserve a book. A librarian can review requests, add titles, and record issue, return, or cancellation. MVP assumption: readers do not create accounts; they submit their name and email, and a librarian handles confirmation in person.

## What it solves and who uses it

The app replaces a paper catalogue and informal reservation list with a searchable collection and a shared request queue. Readers need a quick way to find a title and request it. Librarians need current copy counts and a simple way to track lending. The librarian role is protected by a shared password configured on the server. This is suitable for a classroom demonstration; use individual accounts and stronger operational controls before a real public deployment.

## Features and workflows

- Search books by title, author, or category; see copy availability.
- Submit a reservation request with a name and email. A request begins as `requested`.
- Librarian signs in with the configured password, reviews requests, adds books, and changes request status to `issued`, `returned`, or `cancelled`.
- Issuing reduces the available-copy count; returning restores it. The librarian confirms pickup/return outside the app.
- Seed catalogue records are demo data and can be edited or removed in Supabase.

Pages: one responsive catalogue page, reservation dialog, and librarian sign-in/management dialog. Workflow: search → request → librarian reviews → issue → return.

## Architecture and data

Browser HTML/CSS/vanilla JavaScript calls Express with `fetch()`. Express validates requests and uses the server-only Supabase service-role key to access PostgreSQL. The browser never receives that key. Tables: `books` stores title, author, ISBN, category, total and available copies. `reservations` stores a book foreign key, borrower details and status. One book has many reservations; deleting a referenced book is restricted. RLS is enabled with no anonymous policies because all database access is mediated by Express. Never expose the service-role key.

## Folder structure

```text
library-book-reservation-system/
├── .gitignore
├── README.md
├── backend/
│   ├── .env                 # placeholders only; replace locally
│   ├── .env.example
│   ├── .gitignore
│   ├── package.json
│   ├── package-lock.json
│   └── server.js
├── database/
│   └── schema.sql
└── frontend/
    ├── app.js
    ├── index.html
    └── styles.css
```

## Prerequisites and install links

- Visual Studio Code: https://code.visualstudio.com/
- Node.js LTS (includes npm): https://nodejs.org/
- Git: https://git-scm.com/downloads
- A free Supabase account/project: https://supabase.com/

Verify in a VS Code terminal: `node --version`, `npm --version`, and `git --version`.

## Setup on Windows

1. Download and extract `library-book-reservation-system.zip`. In VS Code choose **File → Open Folder** and select the extracted `library-book-reservation-system` directory.
2. In VS Code choose **Terminal → New Terminal**. From the project root, confirm folders with `Get-ChildItem`.
3. Create a Supabase project at https://supabase.com/dashboard. Wait for the project to finish provisioning.
4. In Supabase, open **SQL Editor → New query**. Open `database/schema.sql` in VS Code, copy all of it into the SQL Editor, and press **Run**. Under **Table Editor**, confirm `books` and `reservations` exist. The three initial books are clearly demo data.
5. In Supabase open **Project Settings → API** (or API Keys in the current dashboard). Copy the Project URL and the `service_role` secret key. Keep the secret server-side. In `backend/.env`, replace the placeholder values for `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `LIBRARIAN_PASSWORD`. Choose your own long librarian password. `PORT=3000` and `NODE_ENV=development` can stay as-is. `.env.example` documents variable names; `.env` contains local secrets and is ignored by Git. To make a random password from Node, run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` in the terminal.
6. Open a terminal in VS Code at the project root and run `cd backend`, then `npm install`. npm downloads the packages listed in `package.json` and creates/updates `package-lock.json`. Success ends without an `npm ERR!` message.
7. Run `npm start` from `backend/`. You should see `Library Book Reservation System: http://localhost:3000`. Open that address in a browser. Leave the terminal running while you use the app.
8. Search a demo book, submit a reservation, then open **Librarian** and sign in with your configured password. Review the request, mark it issued, then returned. Add another book to check the catalogue update.

macOS/Linux: use Terminal and `cd` with forward-slash paths; the Node/npm commands are the same.

## Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | Local web server port (defaults to 3000). |
| `NODE_ENV` | Runtime mode. |
| `SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Private server key that bypasses RLS; never put it in frontend or GitHub. |
| `LIBRARIAN_PASSWORD` | Shared password that protects librarian APIs. |

## API reference

All responses are JSON. Errors use `{ "error": "..." }`. Common statuses: `400` invalid input, `401` missing/incorrect librarian password, `404` missing route/record, `409` conflict or no copies, `500` unexpected failure, `503` server not configured.

| Method / path | Purpose and input | Access | Success |
|---|---|---|---|
| `GET /api/health` | Server status | Public | `{ok, databaseConfigured}` |
| `GET /api/books?q=term` | List/search books; optional query searches title, author, category | Public | `{books:[...]}` |
| `POST /api/reservations` | Body: `{book_id, borrower_name, borrower_email}` | Public; validated | `201 {reservation, message}` |
| `POST /api/librarian/login` | Body: `{password}` | Public password check, rate limited | `{ok:true}` |
| `GET /api/librarian/reservations` | List reservation queue | `x-librarian-password` header | `{reservations:[...]}` |
| `POST /api/librarian/books` | Body: `{title,author,isbn?,category,total_copies}` | Librarian header | `201 {book}` |
| `PATCH /api/librarian/reservations/:id` | Body: `{status:"issued"|"returned"|"cancelled"}` | Librarian header | `{reservation}` |

The login response does not create a browser session; the password is held in page memory while the librarian dialog is open and sent over same-origin requests. Use HTTPS in deployment. This shared-password design is a teaching MVP, not suitable for multiple staff or Internet-facing production. Supabase RLS blocks direct anonymous database access; only the trusted Express server uses the service key. Helmet sets security headers and API requests are rate limited.

## Manual functional checklist

- Open `/api/health`; expect `ok: true`; after credentials are set, `databaseConfigured: true`.
- Catalogue loads demo books; search by title, author, and category filters results; unmatched query gives an empty message.
- Submit valid name/email for an available book; expect a request confirmation and a new librarian queue entry.
- Empty/short name, malformed email, invalid book ID, and unknown book are rejected with a friendly message.
- Try reserving an unavailable book (set its available count to zero in Supabase); expect conflict.
- Librarian APIs without a password or with a wrong password return `401`; correct password allows the queue and book creation.
- Add a book with valid fields; it appears in catalogue. Duplicate ISBN returns `409`; invalid or zero copy count returns `400`.
- Mark a request issued; availability decreases. Mark issued request returned; availability increases. Cancel a request; it closes without changing copies. Closed requests cannot be transitioned again.
- Test at narrow/mobile width and desktop width; controls should reflow and remain keyboard accessible.
- Database service connectivity, browser behavior, and Supabase policies must be tested by the student with their own Supabase project and credentials.

Automated test files are not included in this MVP. Useful manual checks are listed above.

## Troubleshooting

- `Server is not configured`: fill every placeholder in `backend/.env`, save, and restart `npm start`.
- `Invalid API key` / database errors: check URL and service-role key in Supabase project settings; do not use the anon key in this backend variable.
- Empty catalogue or table errors: run the complete `database/schema.sql` in the correct Supabase project.
- Port in use: change `PORT` in `backend/.env` (for example `3001`) and open that port locally.
- `npm` not recognized: install Node.js LTS and reopen VS Code so PATH refreshes.
- If a Supabase key was exposed, rotate it immediately in Supabase. `.gitignore` does not remove secrets already committed.

## Upload to GitHub

Create an empty repository on GitHub (do not add a README if you already have this one). Open a terminal at the project root. Check that `backend/.env` and `node_modules/` are ignored and `.env.example` is included; inspect files for credentials before proceeding.

```powershell
git init
git status
git add .
git status
git commit -m "Build project"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

`git init` starts version control, `git status` shows included/untracked files, `git add .` stages project files, the second status lets you review staging, `git commit` saves a snapshot, `git branch -M main` names the branch, `git remote add origin` connects your GitHub repository (replace the example text with its URL), and `git push` uploads it. Refresh the repository page to verify the files. Never commit `.env`, service keys, or passwords. Adding a file to `.gitignore` does not remove a secret already committed; rotate exposed credentials immediately.

## Scope and future improvements

This MVP omits reader accounts, individual librarian accounts, automatic email notifications, due dates, fines, and database-level atomic multi-step issue/return transactions. It uses a shared librarian password and simple sequential copy-count updates, so it is for learning/local demos. A next iteration should add Supabase Auth with staff roles, transactional database functions for stock transitions, audit history, and due-date tracking.
