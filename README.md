# Botanica Obscura

Idle gacha web game focused on gardening, plant mutations, rare species discovery, and a shared global botanical codex.

## Stack
- HTML / CSS / JavaScript
- Supabase (database + realtime)
- SVG-based plant characters

## Features
- 24h mutation pots
- 5 base species + mutation tree
- Shared codex with first discoverer on the server
- Testers who react to discovered plants

## Setup
1. Copy `.env.example` into your preferred local setup.
2. Update `config.js` with your Supabase URL and publishable key if needed.
3. Open `index.html` with a local server.

## Structure
- `index.html` — main app shell
- `styles.css` — game UI styling
- `app.js` — main game flow
- `config.js` — Supabase config
- `lib/` — api, species tree, svg rendering
