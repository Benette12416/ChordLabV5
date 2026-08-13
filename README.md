# ChordLab V5

V5 converts ChordLab from a local account demo into a cloud-ready web app built around Supabase + Vite + a Vercel serverless AI endpoint.

## What V5 adds

### Cloud PostgreSQL / Supabase
- Supabase Postgres stores song projects as JSONB.
- Cross-device saving: sign in on another computer and open **My Songs**.
- The browser uses only the Supabase URL and publishable key.
- Row Level Security protects ownership, shared access, and public charts.

### Real email authentication
- Email/password signup.
- Email/password login.
- Email confirmation works when enabled in Supabase.
- Password-reset email flow.
- User profiles store display names.

### Cross-device song sync
Once a cloud song is loaded, edits are saved after a short debounce. A collaborator's update is delivered through Supabase Realtime and the editor reloads the newest song state.

V5 currently uses a last-write-wins JSON document. For very large teams, a future version should move to per-chord rows or a CRDT/OT collaboration model.

### Collaboration
Owners can create an invite link with:
- Editor access
- Viewer access

The invited musician signs in and opens the link. The database RPC accepts the invite and creates the correct `song_members` row.

### Public chord charts
Owners can publish a read-only link:
`/?public=PUBLIC_SLUG`

Anonymous visitors can read only songs that have `is_public = true`.

### Production security
`supabase/schema.sql` includes:
- RLS on every app table
- owner policies
- collaborator policies
- public-read policy only for published songs
- private helper functions
- invite acceptance RPC
- explicit grants
- Supabase Realtime publication setup

Never place a Supabase secret/service-role key in the browser.

### Existing V4 features retained
- Full song sections
- Reharmonization styles
- passing chords
- voice leading
- bassist mode
- drag/drop chord blocks
- undo/redo
- copy/paste
- transposition
- key detection
- MIDI import
- live MIDI chord detection
- MIDI recording/export
- chord-chart PDF export
- metronome
- 3-layer piano samples
- local AI fallback

## 1. Create a Supabase project

Create a new Supabase project.

Open **SQL Editor** and run:

`supabase/schema.sql`

## 2. Configure Supabase Auth

In Supabase Auth settings:
- Enable Email provider.
- Set the Site URL to your production domain when you deploy.
- Add local development redirect URL, such as `http://localhost:5173`.
- Add your Vercel production URL to redirect URLs.

If email confirmation is enabled, new users must click the confirmation email before they can sign in.

## 3. Get the browser-safe credentials

From your Supabase project, copy:
- Project URL
- Publishable key

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Do NOT put the Supabase secret/service-role key in a `VITE_...` variable.

## 4. Run locally

Requires Node.js/npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

The local harmony assistant works without OpenAI.

## 5. Optional OpenAI-powered assistant

The API key is used only in `api/ai.mjs` on the server.

For Vercel, add:
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

Choose a model currently available to your OpenAI API project.

When `/api/ai` is unavailable during ordinary Vite development, ChordLab automatically falls back to its local music-theory assistant.

## 6. Deploy on Vercel

Push the project to GitHub, then import it into Vercel.

Set these Vercel environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
OPENAI_API_KEY       (optional)
OPENAI_MODEL         (optional)
```

Vercel should detect Vite and use:

```text
Build command: npm run build
Output directory: dist
```

After the first deployment:
1. Copy the production URL.
2. Add it to Supabase Auth Site URL / Redirect URLs.
3. Redeploy if you changed environment variables.

## Public and collaboration URLs

ChordLab intentionally uses query-string links so no custom SPA route configuration is required:

```text
https://your-domain.example/?public=...
https://your-domain.example/?invite=...
```

## Realtime note

V5 uses Supabase Postgres Changes because it is straightforward for a starter. For heavier production collaboration, move the collaboration transport to Supabase Broadcast/Presence and keep RLS authorization around private channels.

## Files

```text
ChordLab_V5/
├── api/
│   └── ai.mjs
├── public/
│   └── piano/
├── src/
│   ├── main.js
│   └── styles.css
├── supabase/
│   └── schema.sql
├── .env.example
├── .gitignore
├── index.html
├── package.json
└── README.md
```
