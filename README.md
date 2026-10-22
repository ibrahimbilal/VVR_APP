# Video's Factory

A local web app for building 9:16 ranking compilations. Upload clips you have the right to use, order them, style a fixed title banner and ranking numbers, preview the sequence, and export one MP4.

## Requirements

- Node.js 20.19 or newer, or 22.12 or newer
- npm
- About 1 GB free for dependencies and temporary media
- Ports `5173` (editor) and `3001` (renderer) available on this computer

FFmpeg and ffprobe are installed with the server package. You do not need a system-wide FFmpeg install.

## Setup

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

Other scripts:

- `npm run dev` — editor and renderer with reload, on this computer
- `npm run build:dev` / `npm run start:dev` — local build, then serve it at `http://127.0.0.1:3001`
- `npm run build:prod` / `npm run start:prod` — production build. The renderer bundle listens on `PORT`, or on port 3001
- `npm run build` and `npm start` — same as the local `build:dev` and `start:dev` commands
- `npm run typecheck` — check the editor and the renderer

## How to make a video

1. Upload at least two MP4, MOV, or WebM files, or paste a YouTube, TikTok, or Instagram link.
2. Drag clips into order and edit each clip title. Trim the start and end if you want a shorter section.
3. Edit the banner title. Each word has its own color.
4. Adjust ranking numbers, scaling, transitions, and audio in the style panel, or start from a preset.
5. Play the preview. The banner and rank stay in place while the clips change.
6. Export MP4. The download appears after the file has been checked.

A link only looks up a public title when the platform allows it. It does not download the video. Attach a file you are allowed to use before that clip can be exported.

## Completed

- Local upload of MP4, MOV, and WebM, with format and duration checks
- YouTube and TikTok title lookup, plus Instagram link recognition, without downloading
- Clip list with thumbnails, titles, duration, source, remove, replace, and drag reorder
- Fixed top banner with per-word colors, font, size, weight, alignment, line spacing, outline, and shadow
- Ranking numbers generated from clip order, with color, size, position, outline, opacity, and format
- Live 9:16 preview, play/pause, seek, sequential playback, and clip trimming
- Crop, fit, and blurred-background scaling, hard cuts or crossfades, original audio, loudness normalization, and optional music
- Presets: Classic Ranking, Tier List, and Minimal
- Server-side FFmpeg export to 1080×1920 or 720×1280, H.264, AAC when audio is present, 24/30/60 fps
- Export progress, cancellation, and a download only after the output file is verified
- Project layout saved in the browser

## Limitations

- Social platforms are not a download source. If a link cannot be turned into a file, upload a permitted video instead.
- Instagram titles are not fetched. There is no Meta token in this app.
- The preview plays formats the browser can decode. Export can still fail on a file the browser plays if FFmpeg cannot read it, and the other way around.
- One render runs at a time, on this computer. Temporary files live in `server/tmp` and are removed on a schedule.
- Practical limits: 30 clips, 20 minutes per clip, 30 minutes per compilation, 500 MB per video upload.
- The project is stored in this browser. Clearing site data removes it. Uploaded files on the renderer expire after several days.
- Preview timing can differ slightly from the exported file.
- There are no accounts, cloud storage, or a public hosting setup. The app listens on localhost.
