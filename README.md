# Telink Sales Dialer

> AI-powered sales cockpit by Telink AB. Built with Next.js 14, TypeScript, and Tailwind CSS.

## Features

### 📥 Smart CSV Import
- Drag & drop CSV upload with auto-separator detection (comma, semicolon, tab)
- Intelligent field auto-mapping (Swedish & English column names)
- Separate mapping for **Direktnummer** and **Växelnummer**
- Preview & validation before import

### 📊 Live Dashboard
- Real-time list progress bar
- Daily goal circular gauge
- Status distribution breakdown
- Session stats (calls, meetings, conversion rate)

### 📋 Contact List
- Sortable & searchable contact table
- Status filter tabs with counts
- Click-to-call phone links (`tel:` protocol)
- Dual phone display (direct + switchboard)

### 🎯 Cockpit (Focus Mode)
- **Research Engine**: Website iframe + LinkedIn integration side-by-side
- **Smart Fallbacks**: Iframe-blocked sites get "Open in new tab" button; missing LinkedIn auto-generates search URL
- **Keyboard Shortcuts**: 1-7 for status, D for direct call, V for switchboard, N/P for navigation
- **Auto-advance**: Setting a status automatically loads the next unworked lead
- **Auto-save notes**: Debounced 600ms save on every keystroke

### ⌨️ Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `1` | Svarar ej |
| `2` | Nej tack |
| `3` | Bokat möte |
| `4` | Upptaget |
| `5` | Fel nummer |
| `6` | Återsamtal |
| `7` | Intresserad |
| `D` | Ring direkt |
| `V` | Ring växel |
| `N` | Nästa lead |
| `P` | Föregående |
| `?` | Visa/dölj shortcuts |
| `Esc` | Avsluta cockpit |

## Deploy to Vercel

### One-click
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_REPO)

### Manual
```bash
npm install -g vercel
vercel
```

### Local Development
```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 3 (Dark mode)
- **Icons**: Lucide React
- **Fonts**: DM Sans + JetBrains Mono
- **Deployment**: Vercel-ready

## File Structure

```
src/
├── app/
│   ├── globals.css      # Brand styles, animations, scrollbars
│   ├── layout.tsx        # Root layout with fonts
│   └── page.tsx          # Main orchestrator (state management)
├── components/
│   ├── Sidebar.tsx       # Navigation sidebar
│   ├── ImportView.tsx    # CSV upload with drag & drop
│   ├── MappingView.tsx   # Column-to-field mapper
│   ├── DashboardView.tsx # Stats, progress, daily goal
│   ├── ListView.tsx      # Sortable contact table
│   └── CockpitView.tsx   # Focus mode with research engine
├── lib/
│   ├── constants.ts      # Brand, status defs, demo data
│   └── csv-parser.ts     # CSV parsing + auto-mapping
└── types/
    └── index.ts          # TypeScript interfaces
```

## Brand Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `bg` | `#0a0f1a` | Page background |
| `surface` | `#0f1c2e` | Cards, panels |
| `green` | `#3DD68C` | Primary accent (Telink green) |
| `text` | `#e8edf4` | Primary text |
| `muted` | `#8899aa` | Secondary text |

---

Built for Telink AB © 2026
