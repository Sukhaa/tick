import { toPng, toJpeg } from 'html-to-image';

export interface ExportOptions {
  format: 'png' | 'jpg';
  quality?: number;
  filename?: string;
}

// Helper to inline computed styles for all <text> and <tspan> elements in the SVG
function inlineTextStyles(svg: SVGSVGElement) {
  const elements = svg.querySelectorAll('text, tspan');
  elements.forEach(el => {
    const computed = window.getComputedStyle(el);
    el.setAttribute('font-family', computed.fontFamily);
    el.setAttribute('font-size', computed.fontSize);
    el.setAttribute('font-weight', computed.fontWeight);
    el.setAttribute('font-style', computed.fontStyle);
    el.setAttribute('fill', computed.fill);
    el.setAttribute('text-anchor', computed.textAnchor || 'start');
    el.setAttribute('alignment-baseline', computed.alignmentBaseline || 'baseline');
  });
}

// Helper to inline all <image> elements as data URLs
async function inlineSvgImages(svg: SVGSVGElement) {
  const images = svg.querySelectorAll('image');
  const promises = Array.from(images).map(async (img) => {
    let href = img.getAttribute('href') || img.getAttribute('xlink:href');
    if (!href || !href.trim()) {
      // REMOVE the image if href is empty or missing
      img.parentNode?.removeChild(img);
      return;
    }
    if (href.startsWith('data:')) return;
    try {
      const response = await fetch(href, { mode: 'cors' });
      const blob = await response.blob();
      return new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          img.setAttribute('href', reader.result as string);
          img.removeAttribute('xlink:href');
          resolve();
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('Failed to inline image for export:', href, e);
    }
  });
  await Promise.all(promises);
}

// Helper to inline all <img> elements as data URLs (for html-to-image)
async function inlineHtmlImages(container: HTMLElement) {
  const images = container.querySelectorAll('img');
  const promises = Array.from(images).map(async (img) => {
    const src = img.getAttribute('src');
    if (!src || !src.startsWith('blob:')) return;
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      return new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          img.onload = () => resolve();
          img.onerror = (e) => reject(e);
          img.setAttribute('src', reader.result as string);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('Failed to inline HTML image for export:', src, e);
    }
  });
  await Promise.all(promises);
}

// Helper to hide .no-export elements and restore them after
function hideNoExportElements(container: HTMLElement): () => void {
  const elements = Array.from(container.querySelectorAll('.no-export'));
  const prevDisplays = elements.map(el => (el as HTMLElement).style.display);
  elements.forEach(el => ((el as HTMLElement).style.display = 'none'));
  return () => {
    elements.forEach((el, i) => ((el as HTMLElement).style.display = prevDisplays[i]));
  };
}

// Helper to get the tightest bounding box of all SVG content (image, labels, connectors, title)
function getContentBoundingBox(svg: SVGSVGElement): { x: number; y: number; width: number; height: number } {
  // Get all visible SVG elements except defs/markers
  const contentElements = Array.from(svg.querySelectorAll('*'))
    .filter(el => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'defs' || tag === 'marker' || tag === 'filter') return false;
      if (el instanceof SVGGraphicsElement && el.getBBox) {
        const bbox = el.getBBox();
        return bbox.width > 0 && bbox.height > 0;
      }
      return false;
    }) as SVGGraphicsElement[];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  contentElements.forEach(el => {
    const bbox = el.getBBox();
    minX = Math.min(minX, bbox.x);
    minY = Math.min(minY, bbox.y);
    maxX = Math.max(maxX, bbox.x + bbox.width);
    maxY = Math.max(maxY, bbox.y + bbox.height);
  });
  // Fallback to full SVG if nothing found
  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    minX = 0; minY = 0; maxX = svg.width.baseVal.value; maxY = svg.height.baseVal.value;
  }
  // Add 20px padding
  minX = Math.max(0, minX - 20);
  minY = Math.max(0, minY - 20);
  maxX = Math.min(svg.width.baseVal.value, maxX + 20);
  maxY = Math.min(svg.height.baseVal.value, maxY + 20);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export const exportAnnotatedImage = async (
  svgElement: SVGSVGElement,
  options: ExportOptions = { format: 'png', quality: 0.9 },
  containerElement?: HTMLElement // NEW: parent container for html-to-image
): Promise<void> => {
  const { format, quality = 0.9, filename } = options;

  // DEBUG LOGGING
  console.log('Export called with:', { svgElement, containerElement });
  if (!svgElement) {
    console.error('SVG element is null or undefined!');
    alert('Export failed: SVG element is missing.');
    return;
  }
  if (containerElement) {
    console.log('Container element outerHTML:', containerElement.outerHTML);
  } else {
    console.warn('No container element provided for export.');
  }
  console.log('SVG element outerHTML:', svgElement.outerHTML);

  // Wait for all fonts to be loaded before exporting
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  // Clone the SVG so we can safely modify it
  const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
  inlineTextStyles(svgClone);
  await inlineSvgImages(svgClone);

  // Ensure SVG width/height attributes match the viewBox for export
  if (svgClone.viewBox && svgClone.viewBox.baseVal) {
    svgClone.setAttribute('width', String(svgClone.viewBox.baseVal.width));
    svgClone.setAttribute('height', String(svgClone.viewBox.baseVal.height));
  }

  // Use html-to-image for PNG export
  // Always use container element if available, otherwise create a temporary wrapper
  let target: HTMLElement;
  if (containerElement) {
    target = containerElement;
  } else {
    // Create a temporary wrapper div for the SVG
    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.left = '-9999px';
    wrapper.style.top = '-9999px';
    wrapper.appendChild(svgClone);
    document.body.appendChild(wrapper);
    target = wrapper;
  }

  // Inline all <img> elements as data URLs before export
  await inlineHtmlImages(target);

  // Inline SVG <image> elements in the export container as well
  const svgInContainer = target.querySelector('svg');
  if (svgInContainer) {
    await inlineSvgImages(svgInContainer);
  }

  // DEBUG: Log all <img> and <image> sources before export
  const htmlImgs = target.querySelectorAll('img');
  htmlImgs.forEach(img => {
    console.log('[DEBUG] <img> src:', img.getAttribute('src'), img.outerHTML);
  });
  const svgImgs = target.querySelectorAll('image');
  svgImgs.forEach(img => {
    console.log('[DEBUG] <image> href:', img.getAttribute('href') || img.getAttribute('xlink:href'), img.outerHTML);
  });

  // Hide .no-export elements before export
  const restoreNoExport = hideNoExportElements(target);

  // Calculate content bounding box
  const svgForBBox = target.querySelector('svg') || svgElement;
  const bbox = getContentBoundingBox(svgForBBox);

  try {
    let dataUrl: string;
    const clip = { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
    if (format === 'png') {
      dataUrl = await toPng(target, {
        cacheBust: true,
        backgroundColor: '#fff',
        width: target.scrollWidth,
        height: target.scrollHeight,
        clip
      } as any);
    } else {
      dataUrl = await toJpeg(target, {
        cacheBust: true,
        backgroundColor: '#fff',
        quality,
        width: target.scrollWidth,
        height: target.scrollHeight,
        clip
      } as any);
    }
    // Download the image
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename || `annotated-image-${Date.now()}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up temporary wrapper if we created one
    if (!containerElement && target.parentNode) {
      target.parentNode.removeChild(target);
    }
    
    restoreNoExport();
    return;
  } catch (error) {
    restoreNoExport();
    // Improved error logging
    console.error('Export failed:', error);
    console.error('Error type:', typeof error);
    console.error('Error constructor:', error?.constructor?.name);
    
    if (error && error.stack) {
      console.error('Stack trace:', error.stack);
    }
    
    if (error instanceof Event) {
      console.error('Event type:', error.type);
      console.error('Event target:', error.target);
    }
    
    if (typeof target !== 'undefined' && target instanceof Element) {
      console.error('Target node outerHTML:', target.outerHTML);
    }
    
    // Better error message extraction
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (error instanceof Event) {
      errorMessage = `Event error: ${error.type}`;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      errorMessage = JSON.stringify(error);
    }
    
    alert('Export failed. Please try again.\nError: ' + errorMessage);
    throw error;
  }
};

export const getExportFilename = (originalFilename?: string, format: 'png' | 'jpg' = 'png'): string => {
  if (originalFilename) {
    const nameWithoutExt = originalFilename.replace(/\.[^/.]+$/, '');
    return `${nameWithoutExt}-annotated.${format}`;
  }
  return `annotated-image-${Date.now()}.${format}`;
}; 