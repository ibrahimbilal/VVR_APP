# VVR on Hostinger — fixed values

| Field | Value |
| --- | --- |
| Domains | `videos.ibrahimbilal.com` (current), `vvr.ibrahimbilal.com` (legacy) |
| Hosting username | `u841849106` (same account; each domain has its own `public_html`) |
| Site type | Node.js (`website_type: nodejs` after first deploy) |
| Public URL | `https://videos.ibrahimbilal.com` |
| Health check | `GET /api/health` → `{ "ok": true, "ffmpeg": true }` |
| Archive on server | `vvr-app.zip` (relative to each domain’s `public_html`) |

## Node.js build settings (stored on Hostinger)

Use these for `hosting_nodejs_start-build` and `hosting_nodejs_update-build-settings`:

| Setting | Value |
| --- | --- |
| `node_version` | `22` |
| `app_type` | `express` |
| `root_directory` | `.` (or omit / null = repo root in public_html) |
| `output_directory` | `.` |
| `build_script` | `build:prod` |
| `entry_file` | `server/dist/index.js` |
| `package_manager` | `npm` |

Root `package.json` script `build:prod` runs client Vite production build then server esbuild bundle.

## MCP operations (user-hostinger)

| Step | Operation |
| --- | --- |
| List sites | `hosting_websites_list` (filter `domain`) |
| Upload URL | `hosting_files_generate-upload-url` |
| Start deploy | `hosting_nodejs_start-build` |
| Logs | `hosting_nodejs_build-logs` |
| Build state | `hosting_nodejs_list-builds` |
| Stored settings | `hosting_nodejs_build-settings` |
| Restart only | `hosting_nodejs_restart-application` (no rebuild) |

## Limits on shared hosting

- FFmpeg runs via `ffmpeg-static` / `ffprobe-static` (same as local).
- Video render is CPU-heavy; one FFmpeg job at a time (app design).
- Uploaded clips and exports live under `server/tmp/` on the server and are swept on a schedule (see PROJECT.md).
