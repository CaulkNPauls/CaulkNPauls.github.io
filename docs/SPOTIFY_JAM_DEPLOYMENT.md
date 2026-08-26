# Spotify Jam system deployment

The portfolio remains on GitHub Pages. A small Cloudflare Worker stores the current House and Car invite URLs in Workers KV. No DNS change is required: the static pages call the Worker's default `workers.dev` HTTPS URL.

## 1. Install and authenticate Wrangler

Install Node.js 20 or newer, then from the repository root run:

```bash
cd spotify-jam-worker
npm install
npx wrangler login
```

The login command opens Cloudflare authorization in a browser. A Cloudflare account is required.

## 2. Create the Worker, KV binding, and secret

This project uses the KV binding `JAM_STORE`. Its `wrangler.jsonc` intentionally omits an ID: current Wrangler versions automatically provision the namespace on the first deploy and write the generated ID into the config. To create a namespace manually instead, run `npx wrangler kv namespace create JAM_STORE`, then put the returned ID in the `JAM_STORE` entry as `"id": "..."`.

Generate a strong token locally. One option is:

```bash
openssl rand -base64 32
```

Keep the result private. Deploy the Worker once so it exists, then set the secret interactively:

```bash
npx wrangler deploy --env=""
npx wrangler secret put ADMIN_TOKEN
```

Paste the generated token at the prompt. Do not add it to `wrangler.jsonc`, Git, the public website, or a public NFC tag. Cloudflare notes that `secret put` deploys a new Worker version. If the required-secret check prevents the initial deploy, run `npx wrangler secret put ADMIN_TOKEN` first and follow Wrangler's prompt to create the Worker.

Run `npm run deploy` again after any code/configuration change. The explicit empty environment selects the top-level production configuration rather than the separate `dev` environment. Copy the resulting URL, similar to:

```text
https://paulpoleon-spotify-jam.paulpoleon.workers.dev
```

## 3. Connect the static pages

The production Worker URL is configured in the single `apiBase` setting in `jam-config.js`:

```text
https://paulpoleon-spotify-jam.paulpoleon.workers.dev
```

This is the only frontend API URL setting. If the Worker URL ever changes, update it here and in the private Shortcut.

Commit and push the site changes through the repository's normal GitHub Pages workflow. The existing `CNAME` remains unchanged.

## 4. Test the API

Set shell variables for this terminal only (do not commit them):

```bash
export JAM_API_BASE="https://paulpoleon-spotify-jam.paulpoleon.workers.dev"
export JAM_ADMIN_TOKEN="YOUR_ADMIN_TOKEN"
```

An unconfigured Jam should return HTTP 404:

```bash
curl -i "$JAM_API_BASE/api/jam/house"
curl -i "$JAM_API_BASE/api/jam/car"
```

Unauthorized POST must return HTTP 401:

```bash
curl -i -X POST "$JAM_API_BASE/api/jam/house" \
  -H 'Content-Type: application/json' \
  --data '{"url":"https://spotify.link/example"}'
```

Authenticated updates should return `success: true`:

```bash
curl -i -X POST "$JAM_API_BASE/api/jam/house" \
  -H "Authorization: Bearer $JAM_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"url":"https://spotify.link/YOUR_REAL_HOUSE_INVITE"}'

curl -i -X POST "$JAM_API_BASE/api/jam/car" \
  -H "Authorization: Bearer $JAM_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"url":"https://spotify.link/YOUR_REAL_CAR_INVITE"}'
```

Repeat both GET requests and confirm each returns only its own URL and an `updatedAt` timestamp. Then visit `https://paulpoleon.com/jam` and `https://paulpoleon.com/carjam` on a phone.

## 5. Local development

Copy the example secret file without committing the copy:

```bash
cd spotify-jam-worker
cp .dev.vars.example .dev.vars
npm test
npm run dev
```

The `dev` script selects the development environment, enables localhost CORS, and uses local KV storage by default. Temporarily set `jam-config.js` to the local Wrangler URL and serve the repository root in another terminal:

```bash
python3 -m http.server 8000
```

Visit `http://localhost:8000/jam/` and `http://localhost:8000/carjam/`. Restore the production Worker URL in `jam-config.js` before committing. Deploy without `--env dev`; the development Worker is deliberately separate from production.

## 6. Program the NFC tags

- House public tag: `https://paulpoleon.com/jam`
- Car public tag: `https://paulpoleon.com/carjam`

These public values never change. Follow `SPOTIFY_JAM_SHORTCUT.md` for the private admin tag.

## Operations and recovery

- Spotify Jam creation is manual: start the Jam in Spotify, copy its invite link, then run the Shortcut.
- To rotate a lost/exposed token, run `npx wrangler secret put ADMIN_TOKEN` and replace the old token in the private Shortcut.
- The public pages and tags contain no secret.
- KV is eventually consistent globally; updates are generally quick, but a just-updated value can briefly lag at another Cloudflare location. Responses themselves use `Cache-Control: no-store`.
- A future CarPlay/Bluetooth automation may open Spotify or run a helper Shortcut, but this project does not claim to create a Spotify Jam automatically.

Cloudflare references: [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/), [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/), and [KV namespaces](https://developers.cloudflare.com/kv/concepts/kv-namespaces/).
