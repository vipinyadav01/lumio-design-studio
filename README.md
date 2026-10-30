# Lumio — Open-source Canva 

Lumio is an independent, MIT-licensed design editor you can self-host. Create graphics from templates or a blank canvas, edit multi-page designs, then export or share them. Lumio is inspired by Canva and is not affiliated with Canva.

**Latest release:** [v0.1.0](https://github.com/vipinyadav01/lumio-design-studio/releases/tag/v0.1.0)

## Features

- **Dashboard**: create designs from 12 size presets or a custom size, browse and search 20 editable templates, organize designs into folders, mark favourites, and restore items from trash.
- **Editor** (Fabric.js canvas):
  - Text with 10 bundled fonts, font size, bold, italic, underline, strikethrough, alignment, letter spacing and line height. Style changes apply to a highlighted text range while editing.
  - Shapes, lines, images, solid and gradient page backgrounds, photo backgrounds.
  - Move, resize, rotate, flip, duplicate, group/ungroup, lock, layer order, align and distribute, snap guides to the page and other objects.
  - Layers panel (select, rename, hide, lock, drag to reorder).
  - Undo/redo (100 steps), keyboard shortcuts (press `?` in the editor), zoom with Ctrl + scroll, pan with Space + drag.
  - Multi-page designs: add, duplicate, delete and reorder pages, apply templates as new pages, resize the whole design.
  - Drag and drop elements or image files onto the canvas, paste images or text from the clipboard.
- **Brand Kit and photo tools**: save colors, a font and logo; crop uploaded images, apply filters, and remove a background when a remove.bg API key is configured.
- **AI Studio**: generate editable copy and a layout suggestion or create an image when an OpenAI API key is configured.
- **Uploads**: PNG, JPEG, WebP and GIF up to 10 MB, stored in PostgreSQL.
- **Saving**: autosave about a second after each change, an automatic history checkpoint every 10 minutes, named versions, and restore. A design open in two tabs can't silently overwrite itself; the older tab is told to reload.
- **Export**: PNG (optional transparent background), JPG, SVG (images embedded) and multi-page PDF, at up to 4× scale.
- **Portable projects**: download an editable `.lumio` file from the editor's Download dialog and import it from the dashboard on another Lumio server. The file includes every uploaded image used by the design; bundled font names and page content remain editable. Import creates a new design and re-uploads its images. Project files are limited to 64 MB, 100 images, and 10 MB per image.
- **Design health check**: Download checks selected pages for enlarged raster images, text crossing page edges or clipping masks, unavailable fonts, missing assets, and low contrast on solid backgrounds. Warnings are advisory; gradients, photos and per-character text colors need visual review.
- **Editable SVG import**: choose a plain SVG in Uploads or drop it onto the canvas to create separate editable shape, path and text layers. Imports run locally (up to 2 MB / 2,000 elements); scripts, linked resources, embedded images, filters and unsupported SVG features are rejected with an explanation.
- **CSV-driven templates**: Bulk create maps CSV columns to `{{field}}` placeholders in text layers, previews each row, and downloads all generated pages as PNGs in one ZIP. Supports up to 500 CSV rows, 2 MB CSV files, 2,000 output graphics and a 256 MB archive payload, with progress and cancellation.
- **Accounts and sharing**: email/password or Google sign-in, optional email verification and password reset through SMTP, view-only share links with page comments, and "Make a copy" from a shared link.
- **Team workspaces**: create a workspace, add existing users as editors or viewers, and keep team designs separate from personal designs. Editors can edit; viewers get a read-only page.
- **Live editing**: active collaborators are shown in the editor. Saved changes from another tab or teammate load automatically within a few seconds when your copy is idle. Concurrent unsaved changes are protected by revision checks and require reloading the latest version.

## Production tools

### Create graphics from a CSV

1. Add text such as `Hello {{name}}` or `Price: {{price}}` to your design. Placeholders also work inside groups and on multiple pages.
2. Open **Bulk create** and select a UTF-8 CSV with unique column headers, for example:

   ```csv
   name,price
   Ada,$12
   Grace,$20
   ```

3. Map each placeholder to a column. Matching headers connect automatically. Select a preview row to check wrapping and layout.
4. Choose **Download PNGs as ZIP**. Each CSV row creates one PNG per template page at the original design size; filenames include the row and page number. The source design stays unchanged. Replacement text retains layer formatting; per-character styling is cleared when a layer's text changes. Review grouped text when longer values change its bounds.

SVG import, health checks and bulk generation run in the browser without provider API keys or additional self-hosted services. Imported SVG layers save through the normal design autosave. SVG groups are flattened into independently editable layers; positioned text spans become separate text layers. Use inline presentation attributes instead of stylesheets, and outline unsupported text layouts in the SVG source if necessary.

## Self-host in a few steps

You need [Bun](https://bun.sh) (this project uses Bun 1.4), Node.js **20.9 or newer**, and a PostgreSQL database (tested with PostgreSQL 16). The database can be on your own server or with a managed PostgreSQL provider. Lumio is a Next.js server application; static hosting alone will not run its auth, designs, or upload APIs.

1. Clone the repository:

   ```bash
   git clone https://github.com/vipinyadav01/lumio-design-studio.git lumio
   cd lumio
   ```

2. Create an **empty PostgreSQL database** and a user that can create tables and indexes in it. Copy the connection string from your provider or server. Keep this database and its credentials private; all accounts, designs, versions, sessions, and uploaded images are stored there.

3. Configure the app:

   ```bash
   cp .env.example .env
   ```

   Replace `DATABASE_URL` in `.env` with your own connection string, for example `postgresql://lumio:your-password@localhost:5432/lumio`. If your provider requires TLS, use its supplied connection string and SSL settings. URL-encode special characters in the username or password. `TEST_DATABASE_URL` is optional and must point to a **separate disposable test database**.

   If you have a local PostgreSQL server and want the example role and database created for you, keep the example local URL and run `bash scripts/setup-local-db.sh`. This script uses `sudo -u postgres`, accepts only `localhost`/`127.0.0.1`, and does **not** provision a remote database.

4. Install and start:

   ```bash
   bun install --frozen-lockfile
   bun dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) and create an account with email and password. On the first database connection, Lumio creates or updates its tables automatically through the migrations in `lib/server/db.ts`.

### Run on your own server

Set `DATABASE_URL` in the server environment or a private `.env` file, then run:

```bash
bun install --frozen-lockfile
bun run build
bun run start
```

Keep the process running with your process manager, put an HTTPS reverse proxy in front of it, and back up your PostgreSQL database. The app must reach the database from the server. The existing `scripts/setup-local-db.sh` is for a local development database, not production provisioning. A static `next export` deployment will not work for this project.

### Deploy on Vercel

Import the repository as a Next.js project. Add a reachable hosted PostgreSQL `DATABASE_URL` in Vercel's environment variables and deploy. Use a stable production domain if enabling Google sign-in; set `APP_ORIGIN` to that exact HTTPS origin and register `https://your-domain/api/auth/login` as the Google OAuth redirect URI. Preview URLs need their own matching OAuth configuration, so email/password is simplest for preview deployments. Database migrations run automatically on the first database request.

**Upload limit:** Lumio currently accepts images up to 10 MB, while Vercel Functions limit request and response bodies to 4.5 MB. On Vercel, uploads or image responses above that platform limit can fail; use smaller images for a short trial or change the upload/storage flow before relying on larger files. The in-memory rate limiter also applies per function instance, not across the deployment. See [Vercel's function limits](https://vercel.com/docs/functions/limitations) and [environment variable guide](https://vercel.com/docs/environment-variables).

## Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection for the app (required) |
| `TEST_DATABASE_URL` | Optional separate database for data-layer tests. Each test creates and drops a temporary schema. If unset, those tests are skipped. Never use your production database. |
| `DATABASE_POOL_MAX` | Maximum pooled connections per server process/function instance (default 10) |
| `APP_ORIGIN` | Public site origin for Google OAuth redirects, such as `http://localhost:3000` (required for Google sign-in) |
| `GOOGLE_CLIENT_ID` | Google OAuth Web application client ID (required for Google sign-in) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Web application client secret (required for Google sign-in) |
| `SMTP_URL` | Optional SMTP connection URL for email verification and password reset; URL-encode credentials |
| `SMTP_FROM` | Sender address for account email; also requires `APP_ORIGIN` |
| `REMOVE_BG_API_KEY` | Optional remove.bg API key for background removal of uploaded images |
| `OPENAI_API_KEY` | Optional OpenAI API key for AI Studio copy, layout and image generation |
| `OPENAI_TEXT_MODEL` | Optional text model override (default `gpt-4o-mini`) |
| `OPENAI_IMAGE_MODEL` | Optional image model override (default `gpt-image-1-mini`) |

To enable **Continue with Google**, create an OAuth Web application in Google Cloud, add `http://localhost:3000/api/auth/login` as an authorized redirect URI, and set `APP_ORIGIN`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` in `.env`. For production, use your HTTPS origin and register its exact `/api/auth/login` redirect URI. Restart the server after changing these variables. Google sign-in is unavailable until all three are set. Existing accounts using an email outside Gmail or a Google Workspace domain should continue signing in with their password; they are not linked automatically.

Do not commit `.env` or database credentials. `.env.example` contains only examples; it does not enable Google sign-in by itself.

For email verification and password reset, set `APP_ORIGIN`, `SMTP_URL`, and `SMTP_FROM`. New email accounts must verify before signing in when SMTP is enabled. Existing accounts stay verified after migration. Without SMTP, new accounts can sign in immediately and email recovery is unavailable. For AI Studio and background removal, set the provider keys on the server; the browser never receives them. These providers may bill your account. Provider-backed actions have per-user hourly limits stored in PostgreSQL.

### Troubleshooting

- **Database connection fails:** Check that `DATABASE_URL` is set in the environment where the server runs, the database is reachable from that server, and your provider's required TLS settings are present. If migrations fail with a permission error, give the app's database user permission to create tables and indexes in its schema.
- **Google sign-in says it is not set up:** Set all three Google variables, register the exact `/api/auth/login` redirect URI for the site origin, and restart or redeploy.
- **Vercel returns 413 for an image:** Its function payload limit is lower than Lumio's 10 MB application limit. Try a smaller image; larger uploads require a different storage/upload flow.

## Scripts

| Command | What it does |
| --- | --- |
| `bun dev` | Development server |
| `bun run build` / `bun start` | Production build and server |
| `bun run lint` | ESLint (Next.js + React Compiler rules) |
| `bun run typecheck` | Generates route types and runs `tsc` |
| `bun run test` | Vitest unit tests (validation, security helpers, and the data layer against PostgreSQL) |

## Contributing

Bug reports, feature ideas, documentation fixes, and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) for setup, coding conventions, and checks. Use the issue and pull request templates when opening work on GitHub.

## Contributors

After a pull request is merged, the contributor-credit workflow proposes adding its author below in a separate README pull request. A maintainer reviews and merges the credit through the normal branch protection rules. See [Contributor credit](CONTRIBUTING.md#contributor-credit) for setup and the manual fallback, or the [full contribution history](https://github.com/vipinyadav01/lumio-design-studio/graphs/contributors) for commit contributors.

<!-- contributors:start -->
- <a href="https://github.com/vipinyadav01"><img src="https://github.com/vipinyadav01.png?size=32" width="32" height="32" alt="" /></a> <a href="https://github.com/vipinyadav01">Vipin Yadav</a> (@vipinyadav01)
- <a href="https://github.com/omvirgyan"><img src="https://github.com/omvirgyan.png?size=32" width="32" height="32" alt="" /></a> <a href="https://github.com/omvirgyan">OMVIR GYAN</a> (@omvirgyan)
<!-- contributors:end -->

## Support

If Lumio helps you, you can [sponsor the maintainer on GitHub](https://github.com/sponsors/vipinyadav01).

## License

Lumio is released under the [MIT License](LICENSE).

## Architecture

```
app/                      Next.js App Router (Cache Components enabled)
  api/                    JSON route handlers: auth, designs, versions, sharing, uploads
  dashboard/  design/[id]/  s/[token]/  login/  signup/
components/
  editor/engine.ts        EditorEngine: owns the Fabric canvas, pages, history, snapping
  editor/*.tsx            Editor UI (panels, toolbar, page strip, dialogs, shortcuts)
  editor/export.ts        PNG/JPG/SVG/PDF export
lib/
  design/                 Document schema and validation, templates, presets, fonts
  server/                 PostgreSQL access and migrations, auth/sessions, designs, uploads, HTTP helpers
scripts/setup-local-db.sh Creates the local role and databases from .env
tests/                    Vitest suites
```

- **Document format**: each page stores Fabric-serialized objects inside a typed envelope (`lib/design/types.ts`). The server checks every save: only known shape types are allowed, and images may only point at this app's upload URLs.
- **Storage**: documents are `JSONB` and uploads are `BYTEA`. Saves lock the design row and compare a revision number, so concurrent saves can't silently overwrite each other. Editor presence and saved changes use short polling through PostgreSQL, which works on Vercel and self-hosted servers.
- **Editor state**: React subscribes to an immutable snapshot from `EditorEngine` via `useSyncExternalStore`, so the canvas never re-renders through React.

## Security notes

- Passwords are hashed with scrypt. Session tokens are random, stored only as SHA-256 hashes, and sent in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production).
- Google sign-in uses the server-side authorization code flow with PKCE, state and nonce checks, and verified ID tokens. Google account IDs are stored separately from email addresses.
- State-changing API requests must come from the same origin. Login, signup and uploads are rate-limited.
- Uploaded file types are detected from the file contents, not the name or declared type. Uploads are served with `nosniff` and a sandboxing CSP.
- Pages send `frame-ancestors 'none'`, `nosniff` and a strict referrer policy.

## Known limitations

- Upload URLs are unguessable capability links that anyone holding the link can open, so shared designs can show their images.
- The rate limiter is in memory, so it only works for a single server process.
- PDF export embeds each page as a high-resolution image rather than vector text.
- Live editing syncs saved changes; it does not merge simultaneous object changes. If two people edit the same design at once, the later save sees a conflict and must reload, so copy any unsaved work first.
- Email recovery requires SMTP. AI image generation and background removal require provider keys and may be subject to provider limits or charges.
- The editor is usable on phones, but it's designed for desktop.
