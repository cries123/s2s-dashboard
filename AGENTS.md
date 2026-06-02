# Agent instructions

## Cursor Cloud specific instructions

### Stack and dev server

- Run the app with `npm run dev` (Express + Vite on **http://localhost:3000**).
- Lint: `npm run lint`. Production build: `npm run build`.

### DealerBuilt productivity import (Operations tab)

- **Operations → Advisor Performance** import uses `/api/parse-performance` with `dmsProvider: "dealerbuilt"`.
- Set the dealership DMS to **DealerBuilt** in Admin → Operations → DMS Configuration (Firestore `dealershipSettings.dmsProvider`).
- Scanned DealerBuilt **Service Advisor Performance** PDFs have no extractable text; the client sends `pdfBase64` when text extraction is empty.
- Server-side parsing uses **OpenAI gpt-4o vision** via `OPENAI_API_KEY` in `.env` (same key as other ChatGPT parsers in `server.ts`).
- Without `OPENAI_API_KEY`, scanned PDF imports return HTTP 422.
- PDF page rendering prefers `pdftoppm` (poppler-utils) when installed; otherwise falls back to `pdfjs-dist` + `canvas`.

### DMS parser layout

- DMS factory and parsers live under `server/dms/`.
- DealerBuilt performance handlers: `server/dms/parsers/dealerbuiltPerformance*.ts`, route wiring in `server/dms/handlers/parsePerformance.ts`.
