---
name: hostinger-vvr-deploy
description: >-
  Deploys the VVR monorepo to Hostinger Node.js hosting (videos.ibrahimbilal.com
  or vvr.ibrahimbilal.com; domain in REFERENCE.md)
  via archive upload and Start Node.js build. Use when the user asks to upload,
  publish, redeploy, or update VVR on Hostinger, or to fix the live site.
---

# Hostinger deploy (VVR)

Read [REFERENCE.md](REFERENCE.md) for fixed Hostinger targets and build settings. Use the **user-hostinger** MCP server (`search` → `execute`).

## Preconditions

- Node `^20.19.0 || >=22.12.0` locally only for sanity checks; the server builds with **Node 22**.
- `npm run typecheck` passes if you changed code before deploy.
- Do **not** put secrets in the repo. Hostinger sets `PORT`; the app binds `0.0.0.0` when `PORT` is set (`server/src/index.ts`).

## Deploy checklist

```
- [ ] Create vvr-app.zip (exclude node_modules, server/tmp, .git)
- [ ] hosting_files_generate-upload-url → TUS upload vvr-app.zip to public_html
- [ ] hosting_nodejs_start-build (archive vvr-app.zip, settings from REFERENCE.md)
- [ ] Poll hosting_nodejs_build-logs until "Deployment completed"
- [ ] GET https://<domain>/api/health (see REFERENCE.md) → {"ok":true,"ffmpeg":true}
```

## 1. Archive (Windows, repo root)

```powershell
Remove-Item vvr-app.zip -ErrorAction SilentlyContinue
tar -a -c -f vvr-app.zip `
  --exclude=node_modules `
  --exclude=client/node_modules `
  --exclude=server/node_modules `
  --exclude=server/tmp `
  --exclude=.git `
  --exclude=vvr-app.zip .
```

Or run [scripts/make-archive.ps1](scripts/make-archive.ps1).

## 2. Upload archive

1. `hosting_files_generate-upload-url` with `username` and `domain` from REFERENCE.md.
2. TUS upload to `{url}/vvr-app.zip?override=true` with `X-Auth` and `X-Auth-Rest` from the response (short-lived; never commit keys).
3. POST: `Upload-Length`, `Upload-Offset: 0`, `Tus-Resumable: 1.0.0` → expect `201`.
4. PATCH: same URL, `Content-Type: application/offset+octet-stream`, body = file → expect `204`, `Upload-Offset` = file size.

On Windows use `curl.exe` and `--data-binary "@path\to\vvr-app.zip"`.

## 3. Start build

Call `hosting_nodejs_start-build` with every field in REFERENCE.md (same as stored `hosting_nodejs_build-settings`). `source_type`: `archive`, `source_options.archive_path`: `vvr-app.zip`.

**Warning:** a successful build overwrites `public_html`. Only deploy when intended.

## 4. Monitor and verify

- Poll `hosting_nodejs_build-logs` with `from_line` = previous `lines` count until state is `completed` (`hosting_nodejs_list-builds`).
- Open the target domain’s `/api/health` and confirm `ffmpeg: true`.
- Spot-check the editor UI in the browser.

## Environment variables

`hosting_nodejs_list-environment-variables` shows keys only (masked). To change vars, `hosting_nodejs_replace-environment-variables` with the **full** desired set (full replace). VVR needs no custom env vars for a normal deploy.

## Git deploy (optional later)

If the repo is on GitHub/GitLab with a Hostinger Git installation: `hosting_nodejs_build-settings-from-repository`, then `hosting_nodejs_start-build` with `source_type` `git`. Until then, use the archive flow above.

## After deploy

If product behavior or hosting notes changed, add one line to `PROJECT.md` changelog.
