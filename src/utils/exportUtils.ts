export interface ExportOptions {
  format: 'png' | 'jpg' | 'svg';
  quality?: number;
  filename?: string;
}

export const exportAnnotatedImage = async (
  svgElement: SVGSVGElement,
  options: ExportOptions = { format: 'png', quality: 0.9 }
): Promise<void> => {
  const { format, quality = 0.9, filename } = options;

  // Wait for all fonts to be loaded before exporting
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  if (format === 'svg') {
    // Export as SVG
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml' });
    const svgUrl = URL.createObjectURL(svgBlob);
    
    const link = document.createElement('a');
    link.href = svgUrl;
    link.download = filename || `annotated-image-${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(svgUrl);
    return;
  }

  // Export as PNG/JPG
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    // Get SVG dimensions
    const svgRect = svgElement.getBoundingClientRect();
    const svgWidth = svgElement.viewBox.baseVal?.width || svgRect.width;
    const svgHeight = svgElement.viewBox.baseVal?.height || svgRect.height;

    // Set canvas size
    canvas.width = svgWidth;
    canvas.height = svgHeight;

    // Create a temporary image from SVG
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml' });
    const svgUrl = URL.createObjectURL(svgBlob);

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          // Draw the SVG image onto canvas
          ctx.drawImage(img, 0, 0, svgWidth, svgHeight);

          // Convert to blob
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to create blob'));
                return;
              }

              // Create download link
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = filename || `annotated-image-${Date.now()}.${format}`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);

              // Cleanup
              URL.revokeObjectURL(url);
              URL.revokeObjectURL(svgUrl);
              resolve();
            },
            format === 'png' ? 'image/png' : 'image/jpeg',
            quality
          );
        } catch (error) {
          URL.revokeObjectURL(svgUrl);
          reject(error);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(svgUrl);
        reject(new Error('Failed to load SVG image'));
      };
      img.src = svgUrl;
    });
  } catch (error) {
    console.error('Export failed:', error);
    throw error;
  }
};

export const getExportFilename = (originalFilename?: string, format: string = 'png'): string => {
  if (originalFilename) {
    const nameWithoutExt = originalFilename.replace(/\.[^/.]+$/, '');
    return `${nameWithoutExt}-annotated.${format}`;
  }
  return `annotated-image-${Date.now()}.${format}`;
}; 