# Software Download Site

A small Vercel site for uploading Android APK files to Cloudflare R2 and sharing a public download page.

## Features

- Public download page with no user key required.
- Separate admin upload page protected by username/password login.
- Drag-and-drop, paste, and file-picker upload.
- Browser uploads go directly to R2 with presigned PUT URLs.
- Large files upload directly from the browser to R2 with presigned PUT URLs.
- Package metadata is stored in R2 as JSON.
- No framework, no database, no poetry project dependencies.

## Environment Variables

Required on Vercel:

- `UPLOAD_USERNAME`
- `UPLOAD_PASSWORD`
- `AUTH_SECRET`
- `CLOUDFLARE_R2_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET`

Optional:

- `CLOUDFLARE_R2_PUBLIC_BASE_URL`
- `DEFAULT_APP_NAME`
- `DEFAULT_APP_VERSION`
- `DEFAULT_OBJECT_KEY`
- `DEFAULT_SHA256`
- `DEFAULT_SIZE`
- `DEFAULT_RELEASE_DATE`

Download does not require a user key. Upload requires a username/password session on `/upload`. If `CLOUDFLARE_R2_PUBLIC_BASE_URL` is not a public R2 domain, `/api/download` redirects to a short-lived signed R2 URL instead.

## R2 CORS

Direct browser uploads require a CORS policy on the R2 bucket. The policy is in `r2-cors.json`.

With Wrangler logged in:

```bash
npm run configure:cors:wrangler
```

With a Cloudflare API token:

```bash
CLOUDFLARE_API_TOKEN=... npm run configure:cors:api
```

The older `npm run configure:cors` path uses the S3-compatible API and only works if the R2 access key has bucket CORS permissions.
