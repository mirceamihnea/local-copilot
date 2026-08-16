# Local Copilot

[![CI](https://github.com/mirceamihnea/local-copilot/actions/workflows/ci.yml/badge.svg)](https://github.com/mirceamihnea/local-copilot/actions/workflows/ci.yml)

A local-first AI assistant app. It runs a local model through [Ollama](https://ollama.com) (`qwen3:8b`) for private, offline chat, with an optional cloud fallback through a Groq API proxy for access to larger models (GPT-OSS 120B). Ships as an Electron desktop build and as an Android app via Capacitor.

## Features

- **Local chat** — talk to `qwen3:8b` running on your machine through Ollama, no data leaves the device.
- **Optional cloud "Smart" mode** — route requests to Groq's hosted GPT-OSS 120B through a small Cloudflare Worker proxy, so no API key ever needs to live in the client.
- **Resilient model selection** — retired Groq model ids are migrated to the current default on load, and a decommissioned-model error at runtime triggers an automatic switch and retry.
- **Voice input/output** — speak your messages and hear replies read back, using the browser's speech APIs.
- **Saved conversations** — chat history is kept locally and organized into a searchable conversation archive.
- **Notes & tasks panel** — a lightweight task list alongside the chat for tracking to-dos.
- **File knowledge base** — upload PDF, TXT, MD, CSV, JSON, or HTML files and ask questions about them; PDFs are parsed client-side and can be searched by lecture/chapter/page.
- **Optional translation** — auto-translate file-based answers via the browser's built-in translator, a local [LibreTranslate](https://libretranslate.com/) instance, or an online fallback.
- **Themeable UI** — dark/light theme, custom accent color, a large set of built-in wallpapers, or your own uploaded background.

## Tech stack

- Plain HTML/CSS/JavaScript (no build step, no framework) for the web app itself.
- [Ollama](https://ollama.com) for local model inference (`qwen3:8b`).
- [Groq](https://groq.com) API (optional) for cloud inference, proxied through a [Cloudflare Worker](https://developers.cloudflare.com/workers/) so the API key never ships to the client.
- [Capacitor](https://capacitorjs.com/) for the Android build.
- [pdf.js](https://mozilla.github.io/pdf.js/) for in-browser PDF text extraction and page rendering.

## Project layout

```
app/              Web app source (HTML/CSS/JS) — this is what runs in the browser, Electron, or the Capacitor WebView
  index.html
  app.js
  styles.css
  assets/         Icons and wallpapers
proxy/            Cloudflare Worker that proxies Groq API calls (keeps the API key server-side)
  worker.js
  wrangler.toml
android/          Capacitor-generated Android platform project (present after `npx cap add android`)
Tools/            Optional helper scripts (e.g. Start Translator.cmd for local LibreTranslate via Docker)
preview-server.js Tiny static file server for local development (serves app/)
capacitor.config.json  Capacitor app config (app id, name, web directory)
package.json
```

## Running it locally

### Prerequisites

- [Node.js](https://nodejs.org/) (for the preview server and Capacitor tooling).
- [Ollama](https://ollama.com) installed locally, with the model pulled:

  ```
  ollama pull qwen3:8b
  ```

  Local chat talks to Ollama at `http://127.0.0.1:11434`, so Ollama needs to be running for the "Normal" (local) mode to work. This repo does not bundle Ollama or the model — install it once, and every copy of the app on that machine can use it.

### Run in a browser

From the project root:

```
node preview-server.js
```

This serves the `app/` folder at `http://localhost:8532`. Open it in Chrome or Edge (the app uses browser speech APIs, so a Chromium-based browser is recommended).

### Desktop (Electron)

The app is plain static web content, so it can be wrapped with any Electron shell that loads `app/index.html`. No Electron project is included in this repository; point your own Electron main process at the `app/` folder.

### Android (Capacitor)

```
npm install
npx cap add android      # first time only, if the android/ folder doesn't exist yet
npx cap sync android
npx cap open android      # opens Android Studio
```

Note: the app auto-detects when it's running as a native Capacitor app and disables the local-Ollama "Normal" mode there (no local Ollama on mobile), leaving only the Groq-backed "Smart" mode available. Add a Groq API key or point `GROQ_PROXY_ENDPOINT` in `app/app.js` at your deployed proxy for that to work.

## Groq proxy (optional)

`proxy/worker.js` is a minimal Cloudflare Worker that forwards chat requests to Groq's API using a server-side `GROQ_API_KEY` secret, so end users never need to paste in a key. To deploy it:

```
cd proxy
npx wrangler secret put GROQ_API_KEY
npx wrangler deploy
```

Then set the deployed URL as `GROQ_PROXY_ENDPOINT` near the top of `app/app.js`. Without a proxy configured, users can still use "Smart" mode by pasting their own Groq API key into Settings → API.

## Settings

Available in the sidebar settings drawer:

- **Theme** — dark or light.
- **Accent color** — custom accent used throughout the UI.
- **Background** — a large set of built-in wallpapers, or upload your own image.
- **AI instructions** — a custom system prompt appended to every request.
- **Temperature / max tokens** — sampling controls for both local and cloud models.
- **Language** — English or Romanian UI and responses.
