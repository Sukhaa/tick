# Image Annotation Software

A modern React application for effortless image annotation with clear, structured explanations.

## Features

- **Effortless Image Upload**: Support for JPG, PNG, and SVG formats
- **Intuitive Annotation Tools**: 
  - Numbered pointers/arrows
  - Highlight shapes (rectangles, circles)
  - Text labels with color customization
- **Smart Alignment**: Automatic alignment for annotations and notes
- **Dynamic Side Panel**: Auto-formatted notes linked to visual markers
- **Clean UI**: Modern, uncluttered interface following UX best practices

## Tech Stack

- **Frontend**: React.js with TypeScript
- **Styling**: Tailwind CSS
- **Image Processing**: HTML Canvas API
- **State Management**: React Hooks (useState, useCallback)

## Project Structure

```
src/
├── components/     # React components
├── hooks/         # Custom React hooks
├── types/         # TypeScript type definitions
├── utils/         # Utility functions
├── App.tsx        # Main application component
└── index.css      # Global styles with Tailwind
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd image-annotation-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:5173`

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

This project is licensed under the MIT License.
