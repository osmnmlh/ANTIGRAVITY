# web/ — Web dashboard

Main demo surface: status cards, trends, guidance, body map, manual entry.
Stack: Vite + React + TypeScript, recharts, Playwright (`e2e/`). Agents: see skills `web-dashboard`, `playwright-e2e`.

```bash
# scaffold once (choose "Ignore files and continue" when asked about the non-empty folder)
cd web && npm create vite@latest . -- --template react-ts
npm install && npm run dev
```
