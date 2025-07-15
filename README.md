# VizAudit

An application for breakdown and labeling of vizzs or any image.

## 🚀 Live Demo

[https://sukhaa.github.io/tick/](https://sukhaa.github.io/tick/)

## Features

- **Effortless Image Upload**: Support for JPG, PNG, and SVG formats
- **Intuitive Annotation Tools**: 
  - Numbered pointers/arrows
  - Highlight shapes (rectangles, circles)
  - Text labels with color customization
- **Smart Alignment**: Automatic alignment for annotations and notes
- **Dynamic Side Panel**: Auto-formatted notes linked to visual markers
- **Color Palette Extraction**: Extracts and displays the most used colors in the image
- **Clean UI**: Modern, uncluttered interface using MUI (Material UI)
- **Local Project Storage**: Uses IndexedDB for per-browser project storage (no backend required)

## Tech Stack

- **Frontend**: React.js with TypeScript
- **UI**: MUI (Material UI)
- **Image Processing**: HTML Canvas API
- **State Management**: React Hooks (useState, useCallback)
- **Storage**: IndexedDB (per-browser)

## Project Structure

```
src/
├── components/     # React components
├── hooks/         # Custom React hooks
├── types/         # TypeScript type definitions
├── utils/         # Utility functions
├── App.tsx        # Main application component
└── index.css      # Global styles
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

```bash
git clone https://github.com/Sukhaa/tick.git
cd tick/image-annotation-app
npm install
npm run dev
```

Open your browser and navigate to [http://localhost:5173](http://localhost:5173)

## Deployment (GitHub Pages)

1. Set `base: '/tick/'` in `vite.config.js`
2. Install gh-pages:
   ```bash
   npm install --save-dev gh-pages
   ```
3. Add to `package.json`:
   ```json
   "scripts": {
     "predeploy": "npm run build",
     "deploy": "gh-pages -d dist"
   }
   ```
4. Deploy:
   ```bash
   npm run deploy
   ```
5. Visit: [https://sukhaa.github.io/tick/](https://sukhaa.github.io/tick/)

## Usage

1. **Upload Image**: Click the file input to upload an image (JPG, PNG, SVG)
2. **Add Annotations**: Use the annotation tools to mark areas of interest
3. **Write Notes**: Add explanatory text in the side panel
4. **Review**: Click on annotations to highlight corresponding notes

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Adding New Features

1. Create new components in `src/components/`
2. Add custom hooks in `src/hooks/`
3. Define TypeScript types in `src/types/`
4. Add utility functions in `src/utils/`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT
