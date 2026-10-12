# Image Blaster

Photograph in, explorable 3D world out. This is John Constantine’s web app for the [image-blaster](https://github.com/neilsonnn/image-blaster) pipeline: upload a still, generate a Gaussian splat environment with World Labs Marble, then walk around it in the browser and download it.

The original project is MIT-licensed (Neilson Koerner-Safrata, 2026). Its license is in [NOTICE.md](NOTICE.md). This app keeps the same shape — `marble-1.1` for the world, and, optionally, FAL for Nano Banana edits, Hunyuan 3D meshes, and ElevenLabs sound — but it does not run the Claude Code CLI.

## What you can do

1. Drop a JPEG, PNG, or WebP on the home page. The estimate is shown before anything is sent.
2. The server uploads the image to World Labs and calls `POST /marble/v1/worlds:generate` with model `marble-1.1`.
3. The browser polls `GET /marble/v1/operations/{operation_id}` through this app. Generation takes minutes, so no single serverless request waits for it.
4. When the operation completes, fly through the splat and download it. Live worlds also offer the panorama, the collider mesh, and a link to Marble when World Labs returns them.

With no `WORLDLABS_API_KEY`, the same path runs in mock mode against a built-in courtyard splat. Nothing is billed.

## Cost

World Labs bills API credits, purchased on [platform.worldlabs.ai](https://platform.worldlabs.ai). Those credits are separate from Marble app credits. The rate is **$1.00 per 1,250 credits**. See the [pricing docs](https://docs.worldlabs.ai/api/pricing).

For `marble-1.1`:

| Input | Panorama | World | Total | About |
| --- | --- | --- | --- | --- |
| Ordinary photo (`is_pano: false`) | 80 | 1,500 | 1,580 | **$1.26** |
| Equirectangular panorama (`is_pano: true`) | 0 | 1,500 | 1,500 | $1.20 |

The upload screen uses the ordinary-photo figure unless you mark the file as a 360° panorama. Media upload and operation polling do not themselves cost credits. A low balance can still finish a request and create an overage invoice; the pricing page explains that.

World names are sent as `display_name` and capped at 64 characters. `is_pano` is a JSON boolean (`false` for an ordinary photo, `true` for a panorama), which is what the live API accepts. A completed operation includes `cost.total_credits` and line items. The viewer shows that settled charge next to the estimate from the table above.

FAL objects and sound are extra and stay off unless `FAL_KEY` is set and you opt in. FAL prices them on their own invoice.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Variable | Required | Purpose |
| --- | --- | --- |
| `WORLDLABS_API_KEY` | For live worlds | World Labs Platform key. Sent only as the `WLT-Api-Key` header from the server. |
| `FAL_KEY` | No | Turns on optional Nano Banana edits, Hunyuan 3D (`fal-ai/hunyuan3d-v3/image-to-3d`, 50k faces, PBR), and ElevenLabs SFX (`fal-ai/elevenlabs/sound-effects/v2`). |
| `IMAGE_BLASTER_MOCK` | No | Set to `1` to force the courtyard even if a World Labs key is present. |

Do not commit `.env.local`. `.env.example` lists the names only.

Create a World Labs key from the platform API keys page after adding API credits. The app calls:

1. `POST /marble/v1/media-assets:prepare_upload`
2. `PUT` the image to the returned signed URL
3. `POST /marble/v1/worlds:generate` with `source: "media_asset"`, model `marble-1.1`, and `is_pano` as the boolean `false` or `true`
4. `GET /marble/v1/operations/{operation_id}` until `done` is true

Live operations report a status and a description. They do not report a numeric progress fraction, so the waiting screen uses an indeterminate bar and that description. Mock mode still shows a real percent over its eight-second run.

Splats are loaded in the browser with [Spark](https://sparkjs.dev/). Completed worlds include SPZ sizes `100k`, `150k`, `500k`, and `full_res`. The viewer starts on `100k`. Marble SPZ files are scaled with `semantics_metadata.metric_scale_factor`, shifted by `ground_plane_offset`, then rotated 180° around X, which is the OpenCV-to-Three.js conversion described in the [World Labs SPZ rendering notes](https://docs.worldlabs.ai/api/rendering-spz). The world id is read from `world_id`. If the API returns an empty `display_name`, the viewer uses the name you typed, then the caption.

## Mock mode

Leave `WORLDLABS_API_KEY` unset. Upload any photo, or use the courtyard sample. Progress is simulated for about eight seconds, then the viewer opens `/mock/courtyard.splat`. Download returns that file as `courtyard.splat`. Fly with click-drag or pointer lock, WASD, Shift, and Q/E. On a phone, use the pad at the lower right.

## Objects and sound

This matches the original FAL steps, without a vision model choosing the objects for you:

- Check **Also generate objects and sound** (visible only when `FAL_KEY` is set). It defaults to off.
- Add up to three objects. Each one is isolated with `fal-ai/nano-banana-2/edit`, meshed with Hunyuan, and given a short sound.
- An ambient prompt becomes a looping ElevenLabs sound effect.
- Jobs are submitted to the FAL queue and polled. They do not hold the World Labs request open, and the world viewer does not wait for them.
- Finished meshes are placed in a row near the start of the world so they can be inspected and downloaded. The original Claude workflow placed them by hand; this app does not.

## Deploy on Vercel

The app is a Next.js App Router project. Import the repo, set the environment variables on the project, and deploy. `next build` is the build command.

Generation is polled, so function invocations stay short. The generate route is capped at 60 seconds, which only covers the media upload and the `worlds:generate` call. Images are compressed in the browser to stay under Vercel’s 4.5 MB request-body limit.

Live splat files are downloaded by redirecting to the HTTPS URL World Labs returns. Those files are too large to proxy through a function. If a CDN URL does not send browser CORS headers, Spark cannot fetch it; the download link and the Marble link still work. Mock mode is same-origin and is not affected.

## Scripts

```bash
npm test
npm run typecheck
npm run build
npm run generate:mock-splat
```

## Controls

- Click the view and drag, or click to lock the pointer.
- WASD or arrows move. Shift moves faster.
- Q and E move down and up.
- The scroll wheel dollies.
