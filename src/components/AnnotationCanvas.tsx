import React, { useRef, useState, RefObject, useCallback, useEffect } from 'react';
import { ToolType } from './Toolbar';
import { Annotation } from '../types/annotation';

interface AnnotationCanvasProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  tool: ToolType;
  color: string;
  annotations: Annotation[];
  onAddAnnotation: (annotation: Omit<Annotation, 'id' | 'number'>) => Annotation;
  onUpdateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  selectedId: string | null;
  onSelectAnnotation: (id: string | null) => void;
  expandCanvas?: boolean;
  connectorColor?: string;
  connectorStyle?: 'solid' | 'dashed' | 'dotted';
  connectorThickness?: number;
  showLabelNumbers?: boolean;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

interface Point {
  x: number;
  y: number;
}

export const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({
  imageUrl,
  imageWidth,
  imageHeight,
  tool,
  color,
  annotations,
  onAddAnnotation,
  onUpdateAnnotation,
  selectedId,
  onSelectAnnotation,
  expandCanvas = false,
  connectorColor = '#bbb',
  connectorStyle = 'dashed',
  connectorThickness = 2,
  showLabelNumbers = false,
  svgRef: externalSvgRef,
  containerRef: externalContainerRef,
}) => {
  console.log('AnnotationCanvas props:', { imageUrl, imageWidth, imageHeight });
  const [drawing, setDrawing] = useState(false);
  const [start, setStart] = useState<Point | null>(null);
  const [end, setEnd] = useState<Point | null>(null);
  const [pencilPath, setPencilPath] = useState<Point[]>([]);
  const [dragOffset, setDragOffset] = useState<Point | null>(null);
  const [resizing, setResizing] = useState<{ id: string; corner: string } | null>(null);
  const internalSvgRef = useRef<SVGSVGElement>(null);
  const svgRef = externalSvgRef || internalSvgRef;
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [inputPos, setInputPos] = useState<{ x: number; y: number; width?: number; height?: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const labelTextRefs = useRef({});
  // Add a ref for the container div
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef || internalContainerRef;

  // --- Dragging state for shapes and labels ---
  const [dragging, setDragging] = useState<{ id: string; type: 'shape' | 'label'; offset: { x: number; y: number } } | null>(null);

  // Mouse down on shape border to start dragging
  const handleShapeMouseDown = (e: React.MouseEvent, ann: Annotation) => {
    if (tool !== 'pointer' || resizing || editingLabelId) return;
    e.stopPropagation();
    const svgCoords = getSvgCoords(e);
    setDragging({
      id: ann.id,
      type: 'shape',
      offset: {
        x: svgCoords.x - ann.position.x,
        y: svgCoords.y - ann.position.y,
      },
    });
    onSelectAnnotation(ann.id);
  };

  // Mouse down on label text to start dragging label
  const handleLabelMouseDown = (e: React.MouseEvent, ann: Annotation, labelTextX: number, labelTextY: number) => {
    if (tool !== 'pointer' || resizing || editingLabelId) return;
    e.stopPropagation();
    const svgCoords = getSvgCoords(e);
    setDragging({
      id: ann.id,
      type: 'label',
      offset: {
        x: svgCoords.x - labelTextX,
        y: svgCoords.y - labelTextY,
      },
    });
    onSelectAnnotation(ann.id);
  };

  // Mouse move to drag shape or label
  const handleSvgMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return handleMouseMove(e);
    const svgCoords = getSvgCoords(e);
    if (dragging.type === 'shape') {
      onUpdateAnnotation(dragging.id, {
        position: {
          x: svgCoords.x - dragging.offset.x,
          y: svgCoords.y - dragging.offset.y,
        },
      });
    } else if (dragging.type === 'label') {
      // Store label position in annotation (add labelPosition if not present)
      const ann = annotations.find(a => a.id === dragging.id);
      if (ann) {
        onUpdateAnnotation(dragging.id, {
          labelPosition: {
            x: svgCoords.x - dragging.offset.x,
            y: svgCoords.y - dragging.offset.y,
          },
        });
      }
    }
  };

  // Mouse up to end dragging
  const handleSvgMouseUp = (e: React.MouseEvent) => {
    if (dragging) setDragging(null);
    handleMouseUp(e);
  };

  // Convert mouse event to SVG coordinates (responsive-safe)
  const getSvgCoords = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (ctm) {
      const transformed = point.matrixTransform(ctm.inverse());
      return { x: transformed.x, y: transformed.y };
    }
    return { x: 0, y: 0 };
  };

  // --- Drawing tools ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool === 'pointer') {
      // Check if clicking on an annotation
      const coords = getSvgCoords(e);
      const hit = [...annotations].reverse().find((ann) => isPointInAnnotation(coords, ann));
      if (hit) {
        onSelectAnnotation(hit.id);
        // Calculate offset from annotation position (in image coordinates)
        const annotationPos = {
          x: hit.position.x + imageX,
          y: hit.position.y + imageY
        };
        setDragOffset({
          x: coords.x - annotationPos.x,
          y: coords.y - annotationPos.y,
        });
      } else {
        onSelectAnnotation(null);
      }
      return;
    }
    const coords = getSvgCoords(e);
    setDrawing(true);
    setStart(coords);
    setEnd(coords);
    if (tool === 'pencil') {
      setPencilPath([coords]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (tool === 'pointer' && selectedId && dragOffset) {
      // Move annotation
      const coords = getSvgCoords(e);
      // Use dragOffset to preserve pointer position inside the shape
      const newX = coords.x - dragOffset.x - imageX;
      const newY = coords.y - dragOffset.y - imageY;
      if (e.buttons === 1) {
        onUpdateAnnotation(selectedId, {
          position: { x: newX, y: newY },
        });
      }
      return;
    }
    if (tool === 'pointer' && resizing && selectedId) {
      // Resize annotation
      const coords = getSvgCoords(e);
      const annotation = annotations.find(a => a.id === selectedId);
      if (!annotation) return;
      
      const currentX = annotation.position.x + imageX;
      const currentY = annotation.position.y + imageY;
      const currentWidth = annotation.size.width;
      const currentHeight = annotation.size.height;
      
      let newX = annotation.position.x;
      let newY = annotation.position.y;
      let newWidth = currentWidth;
      let newHeight = currentHeight;
      
      switch (resizing.corner) {
        case 'se':
          newWidth = Math.max(10, coords.x - currentX);
          newHeight = Math.max(10, coords.y - currentY);
          break;
        case 'sw':
          newX = coords.x - imageX;
          newWidth = Math.max(10, currentX + currentWidth - coords.x);
          newHeight = Math.max(10, coords.y - currentY);
          break;
        case 'ne':
          newY = coords.y - imageY;
          newWidth = Math.max(10, coords.x - currentX);
          newHeight = Math.max(10, currentY + currentHeight - coords.y);
          break;
        case 'nw':
          newX = coords.x - imageX;
          newY = coords.y - imageY;
          newWidth = Math.max(10, currentX + currentWidth - coords.x);
          newHeight = Math.max(10, currentY + currentHeight - coords.y);
          break;
        case 'n':
          newY = coords.y - imageY;
          newHeight = Math.max(10, currentY + currentHeight - coords.y);
          break;
        case 's':
          newHeight = Math.max(10, coords.y - currentY);
          break;
        case 'e':
          newWidth = Math.max(10, coords.x - currentX);
          break;
        case 'w':
          newX = coords.x - imageX;
          newWidth = Math.max(10, currentX + currentWidth - coords.x);
          break;
      }
      
      if (e.buttons === 1) {
        onUpdateAnnotation(selectedId, {
          position: { x: newX, y: newY },
          size: { width: newWidth, height: newHeight },
        });
      }
      return;
    }
    if (!drawing || !start) return;
    const coords = getSvgCoords(e);
    setEnd(coords);
    if (tool === 'pencil') {
      setPencilPath(path => [...path, coords]);
    }
  };

  const isShapePartiallyInImage = (x: number, y: number, width: number, height: number, imageWidth: number, imageHeight: number) => {
    // Check if any part of the shape is inside the image bounds
    return (
      x + width > 0 &&
      y + height > 0 &&
      x < imageWidth &&
      y < imageHeight
    );
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (tool === 'pointer' && selectedId && dragOffset) {
      setDragOffset(null);
      return;
    }
    if (tool === 'pointer' && resizing) {
      setResizing(null);
      return;
    }
    if (!drawing || !start) return;
    setDrawing(false);
    if (tool === 'pencil' && Array.isArray(pencilPath) && pencilPath.length > 1) {
      // Save as annotation (provide all required props)
      onAddAnnotation({
        type: 'pencil',
        points: pencilPath,
        color,
        position: { x: 0, y: 0 },
        size: { width: 0, height: 0 },
        text: '',
        alignment: 'left',
      });
      setPencilPath([]);
      setStart(null);
      setEnd(null);
      return;
    }
    if (!end) return;
    // Calculate annotation properties (convert from SVG to image coordinates)
    const x = Math.min(start.x, end.x) - imageX;
    const y = Math.min(start.y, end.y) - imageY;
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    // Only allow shape if at least partially inside image
    if (!isShapePartiallyInImage(x, y, width, height, imageWidth, imageHeight)) {
      setStart(null);
      setEnd(null);
      return;
    }
    
    let newAnnotation: Annotation | null = null;
    
    if (tool === 'rectangle' && width > 5 && height > 5) {
      newAnnotation = onAddAnnotation({
        type: 'rectangle',
        position: { x, y },
        size: { width, height },
        color,
        text: '',
        alignment: 'left',
      });
    } else if (tool === 'circle' && width > 5 && height > 5) {
      newAnnotation = onAddAnnotation({
        type: 'circle',
        position: { x, y },
        size: { width, height },
        color,
        text: '',
        alignment: 'left',
      });
    } else if (tool === 'solid-circle') {
      // Draw a smaller, fixed-size solid circle centered at the click
      const fixedSize = 14;
      // The center of the circle should be at the click position
      const centerX = end.x - imageX;
      const centerY = end.y - imageY;
      newAnnotation = onAddAnnotation({
        type: 'solid-circle',
        position: { x: centerX - fixedSize / 2, y: centerY - fixedSize / 2 },
        size: { width: fixedSize, height: fixedSize },
        color,
        text: '',
        alignment: 'left',
      });
    }
    
    // Auto-start label editing for the newly created annotation
    if (newAnnotation) {
      // Use setTimeout to ensure the annotation is rendered before we try to position the input
      setTimeout(() => {
        setEditingLabelId(newAnnotation!.id);
        setEditingText('');
        // Robustly wait for the label text element to exist, then set inputPos
        let attempts = 0;
        const maxAttempts = 10;
        function trySetInputPos() {
          const container = containerRef.current;
          const labelEl = labelTextRefs.current[newAnnotation!.id];
          if (container && labelEl) {
            const containerRect = container.getBoundingClientRect();
            const labelRect = labelEl.getBoundingClientRect();
            setInputPos({
              x: labelRect.left - containerRect.left,
              y: labelRect.top - containerRect.top,
              width: labelRect.width,
              height: labelRect.height
            });
            setTimeout(() => {
              textareaRef.current?.focus();
            }, 0);
          } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(trySetInputPos, 30);
          }
        }
        trySetInputPos();
      }, 100);
    }
    
    setStart(null);
    setEnd(null);
  };

  // --- Hit testing ---
  function isPointInAnnotation(point: Point, ann: Annotation): boolean {
    // Convert annotation position to SVG coordinates
    const annX = ann.position.x + imageX;
    const annY = ann.position.y + imageY;
    
    if (ann.type === 'rectangle') {
      return (
        point.x >= annX &&
        point.x <= annX + ann.size.width &&
        point.y >= annY &&
        point.y <= annY + ann.size.height
      );
    }
    if (ann.type === 'circle') {
      const cx = annX + ann.size.width / 2;
      const cy = annY + ann.size.height / 2;
      const rx = ann.size.width / 2;
      const ry = ann.size.height / 2;
      return (
        ((point.x - cx) ** 2) / (rx ** 2) + ((point.y - cy) ** 2) / (ry ** 2) <= 1
      );
    }
    return false;
  }

  // Render preview shape while drawing
  const renderPreview = () => {
    if (!drawing || !start || !end) return null;
    if (tool === 'pencil' && Array.isArray(pencilPath) && pencilPath.length > 1) {
      const pointsStr = pencilPath.map(p => `${p.x},${p.y}`).join(' ');
      return <polyline points={pointsStr} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />;
    }
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (tool === 'rectangle') {
      return <rect x={x} y={y} width={width} height={height} fill="none" stroke={color} strokeWidth={2} />;
    }
    if (tool === 'circle') {
      return (
        <ellipse
          cx={x + width / 2}
          cy={y + height / 2}
          rx={width / 2}
          ry={height / 2}
          fill="none"
          stroke={color}
          strokeWidth={2}
        />
      );
    }

    return null;
  };

  // Handle label click for editing
  const handleLabelClick = (ann: Annotation, x: number, y: number) => {
    setEditingLabelId(ann.id);
    setEditingText(ann.text || '');
    setInputPos({ x, y });
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  // Handle label edit commit
  const commitLabelEdit = () => {
    if (editingLabelId) {
      onUpdateAnnotation(editingLabelId, { text: editingText });
    }
    setEditingLabelId(null);
    setEditingText('');
    setInputPos(null);
  };

  const boxWidth = 240; // was 180
  const boxHeight = 64; // was 48

  // Calculate label positions (left or right of image)
  const getLabelPosition = (ann: Annotation) => {
    const padding = 16; // tighter to margin
    let badgeX = ann.position.x + imageX;
    let badgeY = ann.position.y + imageY;
    if (ann.type === 'circle') badgeX = ann.position.x + ann.size.width / 2 + imageX;
    if (ann.type === 'text') badgeY = ann.position.y - 24 + imageY;
    const isLeft = badgeX < imageWidth / 2 + imageX;
    // Place label fully outside the image, in the margin
    const x = isLeft ? imageX - badgeRadius : imageWidth + imageX + badgeRadius; // left margin or right margin
    const y = Math.max(padding, Math.min(badgeY - boxHeight / 2, imageHeight + imageY - boxHeight - padding));
    // Offset by margin for SVG coordinates
    return { x, y: y + imageY, isLeft, badgeX: badgeX + imageX, badgeY: badgeY + imageY };
  };

  // Helper to get badge (connector start) position at the edge of the shape (rectangle/circle), or center for solid-circle
  const getBadgeCenter = (ann: Annotation, labelBadgeX: number, labelBadgeY: number) => {
    if (ann.type === 'rectangle') {
      // Rectangle: start at the edge closest to the label
      const x = ann.position.x + imageX;
      const y = ann.position.y + imageY;
      const w = ann.size.width;
      const h = ann.size.height;
      // Center of rectangle
      const cx = x + w / 2;
      const cy = y + h / 2;
      // Direction vector from center to label
      const dx = labelBadgeX - cx;
      const dy = labelBadgeY - cy;
      // Find intersection with rectangle edge
      let tx = 0, ty = 0;
      if (Math.abs(dx / w) > Math.abs(dy / h)) {
        // Intersect with left/right
        tx = dx > 0 ? w / 2 : -w / 2;
        ty = (dy / dx) * tx;
      } else {
        // Intersect with top/bottom
        ty = dy > 0 ? h / 2 : -h / 2;
        tx = (dx / dy) * ty;
      }
      return { x: cx + tx, y: cy + ty };
    } else if (ann.type === 'circle') {
      // Circle: start at the edge in the direction of the label
      const cx = ann.position.x + ann.size.width / 2 + imageX;
      const cy = ann.position.y + ann.size.height / 2 + imageY;
      const rx = ann.size.width / 2;
      const ry = ann.size.height / 2;
      const dx = labelBadgeX - cx;
      const dy = labelBadgeY - cy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      // Point on ellipse edge in direction of label
      return {
        x: cx + (dx / len) * rx,
        y: cy + (dy / len) * ry,
      };
    } else if (ann.type === 'solid-circle') {
      // For solid circle, use center
      return {
        x: ann.position.x + ann.size.width / 2 + imageX,
        y: ann.position.y + ann.size.height / 2 + imageY,
      };
    } else if (ann.type === 'pencil' && Array.isArray(ann.points) && ann.points.length > 0) {
      // Use the first point of the pencil path as the connector start
      return {
        x: ann.points[0].x,
        y: ann.points[0].y
      };
    }
    return { x: ann.position.x + imageX, y: ann.position.y + imageY };
  };

  // Helper: get annotation center in SVG coordinates (including margin)
  const getAnnotationCenter = (ann: Annotation) => {
    if (ann.type === 'rectangle' || ann.type === 'circle') {
      return {
        x: ann.position.x + ann.size.width / 2 + imageX,
        y: ann.position.y + ann.size.height / 2 + imageY,
      };
    } else if (ann.type === 'pencil' && Array.isArray(ann.points) && ann.points.length > 0) {
      // Use the first point of the pencil path as the center for left/right logic
      return {
        x: ann.points[0].x,
        y: ann.points[0].y
      };
    }
    return { x: ann.position.x + imageX, y: ann.position.y + imageY };
  };

  // --- State to store measured label text bounding boxes ---
  // REMOVE: const [labelBBoxes, setLabelBBoxes] = useState<{ [id: string]: { x: number; y: number; width: number; height: number } }>({});

  // --- After render, measure label text bounding boxes ---
  // REMOVE: useEffect(() => { ... });

  // Render SVG label boxes and connectors (fully normalized, SVG-only coordinates)
  const renderLabelsAndConnectors = () => {
    const lineHeight = labelFontSize * 1.2;
    const labelPadding = 12;
    const minGap = 4; // Minimum vertical gap between labels
    // Helper to compute label lines and height
    const getLabelInfo = (ann: Annotation): { ann: Annotation; lines: string[]; height: number } => {
      const maxWordsPerLine = 6;
      const text = ann.text || 'Add note...';
      const words = text.split(/\s+/);
      const lines: string[] = [];
      for (let i = 0; i < words.length; i += maxWordsPerLine) {
        lines.push(words.slice(i, i + maxWordsPerLine).join(' '));
      }
      const height = lines.length * lineHeight + labelPadding;
      return { ann, lines, height };
    };
    // Split left/right
    const left: { ann: Annotation; lines: string[]; height: number }[] = [];
    const right: { ann: Annotation; lines: string[]; height: number }[] = [];
    annotations.forEach(ann => {
      const center = getAnnotationCenter(ann);
      if (center.x < imageWidth / 2 + imageX) left.push(getLabelInfo(ann));
      else right.push(getLabelInfo(ann));
    });
    // Sort by annotation Y
    left.sort((a, b) => getAnnotationCenter(a.ann).y - getAnnotationCenter(b.ann).y);
    right.sort((a, b) => getAnnotationCenter(a.ann).y - getAnnotationCenter(b.ann).y);
    // Compute available vertical space
    const availableTop = imageY;
    const availableBottom = imageY + imageHeight;
    const placeLabels = (arr: { ann: Annotation; lines: string[]; height: number }[]): number[] => {
      // Step 1: Place at natural Y, then push down if needed
      let positions: number[] = [];
      for (let i = 0; i < arr.length; ++i) {
        const centerY = getAnnotationCenter(arr[i].ann).y;
        const naturalY = Math.max(availableTop, Math.min(centerY, availableBottom - arr[i].height));
        if (i === 0) {
          positions.push(naturalY);
        } else {
          const prevBottom = positions[i-1] + arr[i-1].height + minGap;
          positions.push(Math.max(naturalY, prevBottom));
        }
      }
      // Step 2: If last label overflows, shift all up
      if (arr.length > 0) {
        const lastBottom = positions[positions.length-1] + arr[arr.length-1].height;
        const overflow = lastBottom - availableBottom;
        if (overflow > 0) {
          for (let i = 0; i < positions.length; ++i) {
            positions[i] = Math.max(availableTop, positions[i] - overflow);
          }
        }
      }
      return positions;
    };
    const leftYs = placeLabels(left);
    const rightYs = placeLabels(right);
    // For rendering, merge left/right back into sorted order by annotation Y
    const labelRenderList: Array<{ ann: Annotation; lines: string[]; height: number; y: number; isLeft: boolean }> = [
      ...left.map((info, i) => ({...info, y: leftYs[i], isLeft: true})),
      ...right.map((info, i) => ({...info, y: rightYs[i], isLeft: false})),
    ];
    labelRenderList.sort((a, b) => getAnnotationCenter(a.ann).y - getAnnotationCenter(b.ann).y);
    // Track connector indices for elbow staggering
    let leftConnectorIndex = 0, rightConnectorIndex = 0;
    let leftConnectorCount = left.length, rightConnectorCount = right.length;
    // maxRightLabelBoxWidth is already calculated in renderLabelsAndConnectors, so use the same logic here if needed
    const rightEdgeX = imageWidth + imageX + labelMargin; // right edge is a safe margin from image
    return labelRenderList.map((info) => {
      const { ann, lines, height, y, isLeft } = info;
      // Calculate label box dimensions for this label
      const labelBoxWidth = Math.max(180, lines.reduce((max, line) => Math.max(max, line.length), 0) * labelFontSize * 0.6 + 24); // 24px padding
      const labelBoxHeight = height;
      // Label box position (top left)
      const labelBoxY = y;
      let labelBoxX: number;
      if (isLeft) {
        labelBoxX = labelBuffer;
      } else {
        // Always place right label as close as possible to image, unless it would overflow SVG
        const minX = imageWidth + imageX + labelBuffer;
        const maxX = svgWidth - labelBoxWidth - sidebarWidth;
        labelBoxX = Math.min(minX, maxX);
      }
      const safeGap = 16; // px, space between label box edge and text
      // Calculate width of the longest line of text for this label
      const longestLine = lines.reduce((max, line) => line.length > max.length ? line : max, '');
      const labelTextWidth = Math.max(labelFontSize * 0.6 * longestLine.length, 40);
      // For both left and right labels, set labelTextRenderX appropriately
      const labelTextRenderX = isLeft
        ? labelBuffer + safeGap
        : labelBoxX + labelBoxWidth - safeGap;
      // Connector endpoint: at the nearest edge of the label text
      const connectorEndX = isLeft
        ? labelTextRenderX + labelTextWidth
        : labelTextRenderX - labelTextWidth;
      const connectorEndY = labelBoxY + (lines.length * labelFontSize * 1.2) / 2 + 4;
      // SVG-only: connectorEndX is always at the edge of the label box
      // const connectorEndX = isLeft
      //   ? labelBoxX + labelBoxWidth + labelPadding
      //   : labelBoxX - labelPadding;
      const labelTextAnchor = isLeft ? 'start' : 'end';
      // For right labels, text is right-aligned at the right edge of the label box minus safeGap
      // const labelTextRenderX = isLeft
      //   ? labelTextX
      //   : labelBoxX + labelBoxWidth - safeGap;
      // Badge position
      const labelBadgeX = isLeft ? imageX - badgeRadius : imageWidth + imageX + badgeRadius;
      const labelBadgeY = connectorEndY;
      // Dynamic two-elbow connector: stagger bends to avoid overlap
      const badgeStart = getBadgeCenter(ann, labelBadgeX, labelBadgeY);
      // Elbow staggering
      let connectorIndex = isLeft ? leftConnectorIndex++ : rightConnectorIndex++;
      let connectorsOnThisSide = isLeft ? leftConnectorCount : rightConnectorCount;
      const elbowSpread = 80;
      const elbowCenter = (badgeStart.x + labelBadgeX) / 2;
      const elbowMin = elbowCenter - elbowSpread / 2;
      let midwayX = elbowCenter;
      if (connectorsOnThisSide > 1) {
        midwayX = elbowMin + (connectorIndex * (elbowSpread / (connectorsOnThisSide - 1)));
      }
      // Connector path
      const verticalDistance = Math.abs(badgeStart.y - connectorEndY);
      const bendThreshold = 40;
      const curveRadius = Math.min(32, verticalDistance / 2);
      let path;
      if (verticalDistance < bendThreshold) {
        path = [
          `M${badgeStart.x},${badgeStart.y}`,
          `L${midwayX},${badgeStart.y}`,
          `L${connectorEndX},${connectorEndY}`
        ].join(' ');
      } else {
        path = [
          `M${badgeStart.x},${badgeStart.y}`,
          `L${midwayX},${badgeStart.y}`,
          `C${midwayX},${badgeStart.y + curveRadius} ${midwayX},${connectorEndY - curveRadius} ${midwayX},${connectorEndY}`,
          `L${connectorEndX},${connectorEndY}`
        ].join(' ');
      }
      const isSelected = ann.id === selectedId;
      const isEditing = ann.id === editingLabelId;
      return (
        <g key={ann.id + '-label-group'}>
          {/* Connector */}
          <path
            d={path}
            fill="none"
            stroke={isSelected ? '#2563eb' : connectorColor}
            strokeWidth={isSelected ? connectorThickness + 1 : connectorThickness}
            strokeDasharray={
              connectorStyle === 'solid' ? '0' :
              connectorStyle === 'dashed' ? '8 6' :
              connectorStyle === 'dotted' ? '2 6' : '0'
            }
          />
          {/* Label badge */}
          {showLabelNumbers && (
            <circle
              cx={labelBadgeX}
              cy={labelBadgeY}
              r={badgeRadius}
              fill="#2563eb"
              stroke="#fff"
              strokeWidth={3}
            />
          )}
          {showLabelNumbers && (
            <text
              x={labelBadgeX}
              y={labelBadgeY + badgeFontSize / 2.8}
              textAnchor="middle"
              fill="#fff"
              fontSize={badgeFontSize}
              fontWeight="bold"
              alignmentBaseline="middle"
              style={{ userSelect: 'none', fontFamily: 'Inter, Segoe UI, Helvetica Neue, Arial, sans-serif' }}
            >
              {ann.number}
            </text>
          )}
          {/* Label text (no background) */}
          {!isEditing && (
            <text
              ref={el => { labelTextRefs.current[ann.id] = el; }}
              x={labelTextRenderX}
              y={labelBoxY + labelFontSize + 4}
              textAnchor={labelTextAnchor}
              fill={(ann.text && ann.text.trim()) ? '#222' : '#bbb'}
              fontSize={labelFontSize}
              fontWeight={isSelected ? 'bold' : 'normal'}
              alignmentBaseline="hanging"
              style={{ cursor: tool === 'pointer' ? 'move' : 'pointer', userSelect: 'none', fontFamily: 'Trebuchet MS, Inter, Segoe UI, Helvetica Neue, Arial, sans-serif' }}
              onMouseDown={e => handleLabelMouseDown(e, ann, labelBadgeX, labelBadgeY)}
              onClick={e => {
                onSelectAnnotation(ann.id);
                handleLabelClick(ann, labelBadgeX, labelBadgeY);
              }}
            >
              {lines.map((line, i) => (
                <tspan key={i} x={labelTextRenderX} dy={i === 0 ? 0 : labelFontSize * 1.2}>
                  {line || '\u00A0'}
                </tspan>
              ))}
            </text>
          )}
        </g>
      );
    });
  };

  // Render resize handles for selected annotation
  const renderResizeHandles = (ann: Annotation, isSelected: boolean) => {
    if (!isSelected || (ann.type !== 'rectangle' && ann.type !== 'circle')) return null;
    
    const x = ann.position.x + imageX;
    const y = ann.position.y + imageY;
    const width = ann.size.width;
    const height = ann.size.height;
    const handleSize = 8;
    
    const handles = [
      { x: x, y: y, corner: 'nw' },
      { x: x + width / 2, y: y, corner: 'n' },
      { x: x + width, y: y, corner: 'ne' },
      { x: x + width, y: y + height / 2, corner: 'e' },
      { x: x + width, y: y + height, corner: 'se' },
      { x: x + width / 2, y: y + height, corner: 's' },
      { x: x, y: y + height, corner: 'sw' },
      { x: x, y: y + height / 2, corner: 'w' },
    ];
    
    return handles.map((handle) => (
      <rect
        key={`handle-${handle.corner}`}
        x={handle.x - handleSize / 2}
        y={handle.y - handleSize / 2}
        width={handleSize}
        height={handleSize}
        fill="#2563eb"
        stroke="#fff"
        strokeWidth={2}
        style={{ cursor: 'pointer' }}
        onMouseDown={(e) => {
          e.stopPropagation();
          setResizing({ id: ann.id, corner: handle.corner });
        }}
      />
    ));
  };

  // Render existing annotations
  const renderAnnotations = () =>
    annotations.map((ann) => {
      const isSelected = ann.id === selectedId;
      // Calculate badge position (center of shape) in SVG coordinates
      let badgeX = ann.position.x + imageX;
      let badgeY = ann.position.y + imageY;
      if (ann.type === 'circle') {
        badgeX = ann.position.x + ann.size.width / 2 + imageX;
        badgeY = ann.position.y + ann.size.height / 2 + imageY;
      } else if (ann.type === 'text') {
        badgeX = ann.position.x + imageX;
        badgeY = ann.position.y - 24 + imageY;
      }
      // Render shape
      let shape: React.ReactNode = null;
      if (ann.type === 'rectangle') {
        shape = (
          <rect
            key={ann.id}
            x={ann.position.x + imageX}
            y={ann.position.y + imageY}
            width={ann.size.width}
            height={ann.size.height}
            fill="none"
            stroke={isSelected ? '#f59e42' : ann.color}
            strokeWidth={isSelected ? 4 : 2}
            style={{ cursor: tool === 'pointer' ? 'move' : 'default' }}
            onMouseDown={e => handleShapeMouseDown(e, ann)}
          />
        );
      } else if (ann.type === 'circle') {
        shape = (
          <ellipse
            key={ann.id}
            cx={ann.position.x + ann.size.width / 2 + imageX}
            cy={ann.position.y + ann.size.height / 2 + imageY}
            rx={ann.size.width / 2}
            ry={ann.size.height / 2}
            fill="none"
            stroke={isSelected ? '#f59e42' : ann.color}
            strokeWidth={isSelected ? 4 : 2}
            style={{ cursor: tool === 'pointer' ? 'move' : 'default' }}
            onMouseDown={e => handleShapeMouseDown(e, ann)}
          />
        );
      } else if (ann.type === 'solid-circle') {
        shape = (
          <ellipse
            key={ann.id}
            cx={ann.position.x + ann.size.width / 2 + imageX}
            cy={ann.position.y + ann.size.height / 2 + imageY}
            rx={ann.size.width / 2}
            ry={ann.size.height / 2}
            fill={ann.color}
            stroke={isSelected ? '#f59e42' : ann.color}
            strokeWidth={isSelected ? 2 : 1}
            style={{ cursor: tool === 'pointer' ? 'move' : 'default' }}
            onMouseDown={e => handleShapeMouseDown(e, ann)}
          />
        );
      } else if (ann.type === 'pencil' && Array.isArray(ann.points) && ann.points.length > 1) {
        const pointsStr = ann.points.map((p: Point) => `${p.x},${p.y}`).join(' ');
        shape = (
          <polyline
            key={ann.id}
            points={pointsStr}
            fill="none"
            stroke={isSelected ? '#f59e42' : ann.color}
            strokeWidth={isSelected ? 4 : 2}
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ cursor: tool === 'pointer' ? 'move' : 'default' }}
          />
        );
      }
      if (!shape) return null;
      return (
        <g key={ann.id + '-group'}>
          {shape}
          {renderResizeHandles(ann, isSelected)}
        </g>
      );
    }).filter(Boolean);

  // --- Begin dynamic margin calculation ---
  // Calculate the vertical range needed for left and right labels
  const allLabelYs = annotations.map(ann => {
    const center = ann.position.y + (ann.size?.height || 0) / 2;
    return center;
  });
  const minLabelY = allLabelYs.length ? Math.min(...allLabelYs) : 0;
  const maxLabelY = allLabelYs.length ? Math.max(...allLabelYs) : imageHeight;
  
  // Add padding above the highest label and below the lowest label
  const labelPadding = 40; // px, increased for better spacing
  const topMargin = Math.max(labelPadding, imageHeight / 30);
  const bottomMargin = Math.max(labelPadding, imageHeight / 15, maxLabelY - imageHeight / 2 + labelPadding);

  // --- Begin dynamic side margin calculation ---
  // Estimate the width of the longest label line on each side after word wrapping
  const maxWordsPerLine = 6; // Define once at component level
  const getLabelWrappedLines = (text: string): string[] => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    for (let i = 0; i < words.length; i += maxWordsPerLine) {
      lines.push(words.slice(i, i + maxWordsPerLine).join(' '));
    }
    return lines;
  };
  const getMaxLineLength = (annList: Annotation[]): number => {
    let maxLen = 0;
    for (const ann of annList) {
      const lines = getLabelWrappedLines(ann.text || 'Add note...');
      for (const line of lines) {
        maxLen = Math.max(maxLen, line.length);
      }
    }
    return maxLen;
  };
  // More accurate character width calculation based on font size
  const minLabelFontSize = 18;
  const maxLabelFontSize = 28;
  const labelFontSize = Math.max(minLabelFontSize, Math.min(maxLabelFontSize, Math.round(imageHeight / 35)));
  const approxCharWidth = labelFontSize * 0.6; // More accurate: ~0.6x font size for most fonts
  const labelBuffer = 40; // px, buffer between label and image
  // Left labels
  const leftLabels = annotations.filter(ann => {
    const center = ann.position.x + (ann.size?.width || 0) / 2;
    return center < imageWidth / 2;
  });
  const maxLeftLineLen = getMaxLineLength(leftLabels);
  const maxLeftLabelWidth = maxLeftLineLen * approxCharWidth;
  // Calculate max label box width for left and right labels
  const maxLeftLabelBoxWidth = leftLabels.length > 0 ? Math.max(...leftLabels.map(ann => {
    const lines = getLabelWrappedLines(ann.text || 'Add note...');
    return Math.max(180, lines.reduce((max, line) => Math.max(max, line.length), 0) * approxCharWidth + 24);
  })) : 0;
  // Right labels
  const rightLabels = annotations.filter(ann => {
    const center = ann.position.x + (ann.size?.width || 0) / 2;
    return center >= imageWidth / 2;
  });
  const maxRightLineLen = getMaxLineLength(rightLabels);
  const maxRightLabelWidth = maxRightLineLen * approxCharWidth;
  // maxRightLabelBoxWidth is already calculated in renderLabelsAndConnectors, so use the same logic here if needed
  const sidebarWidth = 64; // px, fixed width for sidebar UI
  // For left labels, calculate the leftmost X of the text
  let minLeftTextX = 0;
  leftLabels.forEach(ann => {
    const lines = getLabelWrappedLines(ann.text || 'Add note...');
    const labelBoxWidth = Math.max(180, lines.reduce((max, line) => Math.max(max, line.length), 0) * approxCharWidth + 24);
    const safeGap = 16;
    const longestLine = lines.reduce((max, line) => line.length > max.length ? line : max, '');
    const labelTextWidth = Math.max(labelFontSize * 0.6 * longestLine.length, 40);
    // labelBoxX is labelBuffer
    const leftTextX = labelBuffer + safeGap;
    // The left edge of the text is leftTextX
    if (minLeftTextX === 0 || leftTextX < minLeftTextX) minLeftTextX = leftTextX;
  });
  // Add buffer
  const leftMargin = Math.max(leftLabels.length > 0 ? maxLeftLabelBoxWidth + labelBuffer : labelBuffer, minLeftTextX + 24);
  // For right labels, calculate the rightmost X of the text, assuming labelBoxX is always at imageX + imageWidth + labelBuffer
  let maxRightTextX = imageWidth + leftMargin; // start with image right edge
  rightLabels.forEach(ann => {
    const lines = getLabelWrappedLines(ann.text || 'Add note...');
    const labelBoxWidth = Math.max(180, lines.reduce((max, line) => Math.max(max, line.length), 0) * approxCharWidth + 24);
    const safeGap = 16;
    const longestLine = lines.reduce((max, line) => line.length > max.length ? line : max, '');
    const labelTextWidth = Math.max(labelFontSize * 0.6 * longestLine.length, 40);
    const labelBoxX = leftMargin + imageWidth + labelBuffer; // always as close as possible
    const rightTextX = labelBoxX + labelBoxWidth - safeGap + labelTextWidth;
    if (rightTextX > maxRightTextX) maxRightTextX = rightTextX;
  });
  // Add sidebar and buffer
  const rightMargin = Math.max((rightLabels.length > 0 ? maxRightLabelWidth + labelBuffer : labelBuffer) + sidebarWidth, maxRightTextX - (leftMargin + imageWidth) + sidebarWidth + 24);
  const svgWidth = leftMargin + imageWidth + rightMargin;
  const svgHeight = imageHeight + topMargin + bottomMargin;
  const imageX = leftMargin;
  const imageY = topMargin;

  // Dynamic sizing for labels based on image size
  const minBadgeRadius = 20;
  const maxBadgeRadius = 40;
  const badgeRadius = Math.max(minBadgeRadius, Math.min(maxBadgeRadius, Math.round(imageWidth * 0.045)));
  const badgeFontSize = Math.max(18, Math.min(32, Math.round(imageWidth * 0.025)));

  // labelFontSize is already declared above in the margin calculation section
  const labelMargin = 32; // px, fixed margin between image and right labels

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.2, 4));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.2, 0.2));
  const handleZoomReset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  if (!imageWidth || !imageHeight || imageWidth < 2 || imageHeight < 2) {
    return <div className="w-full h-64 flex items-center justify-center text-gray-400">No image loaded</div>;
  }

  // Add useEffect to position the input when editingLabelId or annotations change
  useEffect(() => {
    if (editingLabelId) {
      const container = containerRef.current;
      const labelEl = labelTextRefs.current[editingLabelId];
      if (container && labelEl) {
        const containerRect = container.getBoundingClientRect();
        const labelRect = labelEl.getBoundingClientRect();
        setInputPos({
          x: labelRect.left - containerRect.left,
          y: labelRect.top - containerRect.top,
          width: labelRect.width,
          height: labelRect.height
        });
      }
    }
  }, [editingLabelId, annotations]);

  // Focus textarea when entering label edit mode
  useEffect(() => {
    if (editingLabelId && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [editingLabelId]);

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center bg-white" style={{ minHeight: 400, minWidth: 400 }}>
      <div
        className="relative"
        style={{
          maxWidth: '100%',
          maxHeight: '80vh',
          overflow: 'auto',
          position: 'relative',
          background: '#fff',
        }}
        onWheel={e => {
          if (e.ctrlKey) return; // Let browser handle pinch-to-zoom
          e.preventDefault();
          if (e.deltaY < 0) setZoom(z => Math.min(z + 0.1, 4));
          else setZoom(z => Math.max(z - 0.1, 0.2));
        }}
      >
        {/* Zoom controls at bottom right of visible area */}
        <div style={{ position: 'absolute', bottom: '1rem', right: '1rem', zIndex: 10 }} className="flex flex-col gap-1 bg-white bg-opacity-80 rounded shadow p-1">
          <button onClick={handleZoomIn} className="px-2 py-1 rounded hover:bg-blue-100 font-bold" title="Zoom In">+</button>
          <button onClick={handleZoomOut} className="px-2 py-1 rounded hover:bg-blue-100 font-bold" title="Zoom Out">-</button>
          <button onClick={handleZoomReset} className="px-2 py-1 rounded hover:bg-blue-100 font-bold" title="Reset Zoom">⟳</button>
          <span className="text-xs text-gray-600 text-center">{Math.round(zoom * 100)}%</span>
        </div>
        {/* SVG with transform */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          width={svgWidth}
          height={svgHeight}
          className="cursor-crosshair"
          style={{
            border: '1px solid #e5e7eb',
            background: '#fff',
            maxWidth: '100%',
            maxHeight: '80vh',
            transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
            transformOrigin: 'center center',
            transition: 'transform 0.2s',
            display: 'block',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
        >
          {/* Arrowhead marker definitions */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="10"
              refY="3.5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#bbb" />
            </marker>
            <marker
              id="arrowhead-selected"
              markerWidth="10"
              markerHeight="7"
              refX="10"
              refY="3.5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#2563eb" />
            </marker>
          </defs>
          {/* SVG defs for label shadow */}
          <defs>
            <filter id="labelShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.10" />
            </filter>
          </defs>
          {/* Render the image centered in the expanded SVG */}
          <image
            href={imageUrl}
            x={imageX}
            y={imageY}
            width={imageWidth}
            height={imageHeight}
            style={{ pointerEvents: 'none' }}
          />
          {renderLabelsAndConnectors()}
          {renderAnnotations()}
          {renderPreview()}
        </svg>
      </div>
      {/* Inline label editing input */}
      {editingLabelId && inputPos && (
        <textarea
          ref={textareaRef}
          value={editingText}
          onChange={e => setEditingText(e.target.value)}
          onBlur={e => { e.target.style.outline = 'none'; e.target.style.border = 'none'; e.target.style.borderRadius = '8px'; commitLabelEdit(); }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitLabelEdit();
            }
            // Shift+Enter inserts a newline by default
          }}
          className="absolute z-10 resize-none"
          style={{
            left: inputPos.x,
            top: inputPos.y,
            minWidth: 60,
            width: inputPos.width || 'auto',
            height: inputPos.height || 'auto',
            fontSize: labelFontSize,
            fontFamily: 'Trebuchet MS, Inter, Segoe UI, Helvetica Neue, Arial, sans-serif',
            fontWeight: 'normal',
            color: '#222',
            outline: 'none',
            border: 'none',
            background: 'transparent',
            boxShadow: 'none',
            padding: 0,
            margin: 0,
            borderRadius: '8px',
            lineHeight: 1.2,
            transition: 'border 0.15s, border-radius 0.15s',
            overflow: 'hidden',
            resize: 'none',
            whiteSpace: 'pre',
          }}
          rows={Math.max(1, editingText.split('\n').length)}
          onFocus={e => { e.target.style.outline = 'none'; e.target.style.border = '2px solid #2563eb'; e.target.style.borderRadius = '8px'; }}
        />
      )}
    </div>
  );
}; 