# Clicknet Sales Dialer

> AI-powered sales cockpit by Clicknet. Built with Next.js 14, TypeScript, and Tailwind CSS.

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
│   ├── globals.css       # Designsystem: tokens, elevation, komponentklasser
│   ├── layout.tsx        # Root layout, fonter
│   ├── cockpit/          # Power-dialing
│   ├── lists/            # Ringlistor
│   ├── leads/            # Leads + leaddetalj
│   ├── pipeline/         # Kanban
│   ├── stats/            # Statistik
│   ├── import/           # Import av lead-filer
│   └── admin/            # Golvet, manus, dialerinställningar, användare
├── components/
│   ├── AppSidebar.tsx    # Navigationsskena, expanderbar och pinnbar
│   ├── CockpitDb.tsx     # Cockpit
│   ├── cockpit/          # Disposition, ramverk, växel, manuspanel
│   ├── lists/ leads/ pipeline/ stats/ scripts/ admin/ deals/
│   └── skeletons/
├── lib/
│   ├── scheduler.ts      # Uppföljningsmotorn
│   ├── script-resolver.ts
│   ├── enrichment/       # Berikning av leads
│   └── research/         # Researchmotorn
└── types/
```

## Designsystem

Doktrin och tokens ligger överst i `src/app/globals.css`, reglerna i `CLAUDE.md`.
Kort version: lager separeras med yta och linje, skuggan har fem nivåer och
betyder en relation, accenten är en ficklampa.

| Token | Ljus | Mörk | Användning |
|-------|------|------|------------|
| `--bg` | `#F1F3F6` | `#0C0E12` | Sidbotten |
| `--surface` | `#FFFFFF` | `#161A20` | Kort, paneler |
| `--accent` | `#0B7F6E` | `#2FC08F` | Primär åtgärd, aktivt läge, fokusring |
| `--text` | `#101828` | `#ECEFF4` | Brödtext |
| `--text-muted` | `#667085` | `#8A93A3` | Sekundär text |

Clicknet-grönt `#3DD68C` bor kvar i `--accent-bright` för grafik på mörk yta.
Som knappyta i ljust läge ger det 1,7:1 mot vit text, därav den sänkta valören.

---

Built for Clicknet © 2026
