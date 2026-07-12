<div align="center">
<img width="1200" alt="Earth Events Archive" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Earth Events Archive

A 3D globe visualization of geolocated intelligence events extracted from Telegram channels using Gemini AI. Built with React, TypeScript, Vite, and Leaflet.

## Features

- **3D Globe Visualization** — Interactive globe plotting events by geographic coordinates
- **AI-Powered Extraction** — Gemini API parses Telegram messages into structured event data
- **Multi-Source Ingestion** — Aggregates from preferred Telegram channels with automatic refresh
- **Situation Reports** — AI-generated summaries of regional developments
- **Bilingual UI** — English and Farsi language support
- **Local Persistence** — Caches events and sync config in browser storage

## Tech Stack

- React 18, TypeScript, Vite
- Leaflet + react-leaflet for mapping
- @google/genai for AI extraction and analysis
- lucide-react for icons

## Getting Started

```bash
npm install
# Set GEMINI_API_KEY in .env.local
npm run dev
```

## CI

![CI](https://github.com/Tabasiarash/Earth-Events-archive/actions/workflows/ci.yml/badge.svg)

## License

MIT
