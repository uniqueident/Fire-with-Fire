# Fire-with-Fire

Fire-with-Fire is a Chrome extension built with React and Vite. Its Canvas integration uses a local Node.js bridge and a local Ollama server.

## Requirements

- Node.js 20.19 or later and npm
- Google Chrome
- Ollama, if you want to use chat features
- A Canvas API URL and access token, if you want to use Canvas features

## Install

Open a terminal in the extension project directory and install its dependencies:

```sh
cd my-chrome-extension
npm install
```

## Configure Canvas

Create `my-chrome-extension/src/.env` with your Canvas instance URL and API token:

```env
CANVAS_BASE_URL=https://your-school.instructure.com
CANVAS_API_TOKEN=your_canvas_api_token
```

Keep this file private. Do not share your Canvas API token in any form.

## Run Locally

From `my-chrome-extension`, start the extension UI:

```sh
npm run dev
```

To start the extension UI and Canvas bridge together, configure Canvas as above and run:

```sh
npm run dev:all
```

The UI runs at `http://localhost:5173`. Chat features also require Ollama running locally at `http://127.0.0.1:11434` and a model that supports tool calling.

## Build and Load in Chrome

Build the extension from `my-chrome-extension`:

```sh
npm run build
```

In Chrome, open `chrome://extensions`, enable Developer mode, select **Load unpacked**, and choose the generated `my-chrome-extension/dist` directory. After rebuilding, reload the extension from the extensions page.

## Other Commands

Run lint checks:

```sh
npm run lint
```

Build the standalone Canvas MCP server:

```sh
npm run build:mcp
```
