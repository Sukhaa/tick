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
}) => {
  console.log('AnnotationCanvas props:', { imageUrl, imageWidth, imageHeight });
  const [drawing, setDrawing] = useState(false);
  const [start, setStart] = useState<Point | null>(null);
  const [end, setEnd] = useState<Point | null>(null);
  const [dragOffset, setDragOffset] = useState<Point | null>(null);
  const [resizing, setResizing] = useState<{ id: string; corner: string } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [inputPos, setInputPos] = useState<{ x: number; y: number; width?: number; height?: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const labelTextRefs = useRef({});
  // Add a ref for the container div
  const containerRef = useRef<HTMLDivElement>(null);

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
    setDrawing(true);
    const coords = getSvgCoords(e);
    setStart(coords);
    setEnd(coords);
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
    setEnd(getSvgCoords(e));
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
    if (!drawing || !start || !end) return;
    setDrawing(false);
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
    if (tool === 'rectangle' && width > 5 && height > 5) {
      onAddAnnotation({
        type: 'rectangle',
        position: { x, y },
        size: { width, height },
        color,
        text: '',
        alignment: 'left',
      });
    } else if (tool === 'circle' && width > 5 && height > 5) {
      onAddAnnotation({
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
      onAddAnnotation({
        type: 'solid-circle',
        position: { x: centerX - fixedSize / 2, y: centerY - fixedSize / 2 },
        size: { width: fixedSize, height: fixedSize },
        color,
        text: '',
        alignment: 'left',
      });
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
    if (tool === 'text') {
      return (
        <text x={end.x} y={end.y} fill={color} fontSize={18} alignmentBaseline="middle">
          Text
        </text>
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
    }
    return { x: ann.position.x + imageX, y: ann.position.y + imageY };
  };

  // Render SVG label boxes and connectors (fully normalized)
  const renderLabelsAndConnectors = () => {
    let lastLeftY = imageY - boxHeight; // Start above margin so first label can be at margin
    let lastRightY = imageY - boxHeight;
    const minSpacing = boxHeight + 16; // Add extra padding
    let leftIndex = 0;
    let rightIndex = 0;
    // Dynamic sizing for labels based on image size
    const minBadgeRadius = 20;
    const maxBadgeRadius = 40;
    const badgeRadius = Math.max(minBadgeRadius, Math.min(maxBadgeRadius, Math.round(imageWidth * 0.045)));
    const badgeFontSize = Math.max(18, Math.min(32, Math.round(imageWidth * 0.025)));
    const labelFontSize = Math.max(18, Math.min(28, Math.round(imageWidth * 0.022)));
    const sorted = [...annotations].sort((a, b) => getAnnotationCenter(a).y - getAnnotationCenter(b).y);
    // Track how many left/right connectors we've placed so far
    let leftConnectorIndex = 0;
    let rightConnectorIndex = 0;
    return sorted.map((ann) => {
      const center = getAnnotationCenter(ann);
      const isLeft = center.x < imageWidth / 2 + imageX;
      // In renderLabelsAndConnectors, ensure labelBadgeX is always outside the image
      const labelBadgeX = isLeft ? imageX - badgeRadius : imageWidth + imageX + badgeRadius;
      let labelBadgeY = center.y;
      // Improved vertical staggering to guarantee no overlap
      if (isLeft) {
        labelBadgeY = Math.max(labelBadgeY, lastLeftY + minSpacing);
        lastLeftY = labelBadgeY;
        leftIndex++;
      } else {
        labelBadgeY = Math.max(labelBadgeY, lastRightY + minSpacing);
        lastRightY = labelBadgeY;
        rightIndex++;
      }
      // Dynamic two-elbow connector: stagger bends to avoid overlap
      const badgeStart = getBadgeCenter(ann, labelBadgeX, labelBadgeY);
      // Determine connector index for this side
      let connectorIndex = 0;
      if (isLeft) {
        connectorIndex = leftConnectorIndex++;
      } else {
        connectorIndex = rightConnectorIndex++;
      }
      // Stagger the midway x for each connector on the same side
      const staggerAmount = 32; // px between bends
      let midwayX = (badgeStart.x + labelBadgeX) / 2;
      if (isLeft) {
        midwayX -= connectorIndex * staggerAmount;
      } else {
        midwayX += connectorIndex * staggerAmount;
      }
      // Path: shape edge -> midwayX (horizontal) -> midwayX,labelY (vertical) -> label badge (horizontal)
      const path = [
        `M${badgeStart.x},${badgeStart.y}`,
        `L${midwayX},${badgeStart.y}`,
        `L${midwayX},${labelBadgeY}`,
        `L${labelBadgeX},${labelBadgeY}`
      ].join(' ');
      const isSelected = ann.id === selectedId;
      const isEditing = ann.id === editingLabelId;
      const extraPadding = isLeft ? 64 : 96; // Adjusted for right-side labels
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
            markerEnd={`url(#${isSelected ? 'arrowhead-selected' : 'arrowhead'})`}
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
          {/* Label text */}
          {!isEditing && (
            <text
              ref={el => { if (el) labelTextRefs.current[ann.id] = el; }}
              x={isLeft ? labelBadgeX - extraPadding : labelBadgeX + extraPadding}
              y={labelBadgeY + 8}
              textAnchor={isLeft ? 'end' : 'start'}
              fill="#222"
              fontSize={labelFontSize}
              fontWeight={isSelected ? 'bold' : 'normal'}
              alignmentBaseline="middle"
              style={{ cursor: 'pointer', userSelect: 'none', fontFamily: 'Inter, Segoe UI, Helvetica Neue, Arial, sans-serif' }}
              onClick={e => {
                onSelectAnnotation(ann.id);
                // Get bounding rect of label text
                const container = containerRef.current;
                const labelEl = labelTextRefs.current[ann.id];
                if (container && labelEl) {
                  const containerRect = container.getBoundingClientRect();
                  const labelRect = labelEl.getBoundingClientRect();
                  setInputPos({
                    x: labelRect.left - containerRect.left,
                    y: labelRect.top - containerRect.top,
                  });
                }
                handleLabelClick(ann, labelBadgeX, labelBadgeY);
              }}
            >
              {(ann.text || 'Add note...').split('\n').map((line, i) => (
                <tspan key={i} x={isLeft ? labelBadgeX - extraPadding : labelBadgeX + extraPadding} dy={i === 0 ? 0 : labelFontSize * 1.2}>
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
            onMouseDown={tool === 'pointer' ? (e) => { e.stopPropagation(); onSelectAnnotation(ann.id); } : undefined}
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
            onMouseDown={tool === 'pointer' ? (e) => { e.stopPropagation(); onSelectAnnotation(ann.id); } : undefined}
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
            onMouseDown={tool === 'pointer' ? (e) => { e.stopPropagation(); onSelectAnnotation(ann.id); } : undefined}
          />
        );
      }
      if (!shape) return null;
      // Render simple solid circle at annotation center
      const badge = (
        <circle
          key={ann.id + '-badge'}
          cx={badgeX}
          cy={badgeY}
          r={8}
          fill={isSelected ? '#2563eb' : '#fff'}
          stroke={isSelected ? '#2563eb' : '#888'}
          strokeWidth={2}
          style={{ cursor: 'pointer' }}
          onMouseDown={tool === 'pointer' ? (e) => { e.stopPropagation(); onSelectAnnotation(ann.id); } : undefined}
        />
      );
      return (
        <g key={ann.id + '-group'}>
          {shape}
          {badge}
          {renderResizeHandles(ann, isSelected)}
        </g>
      );
    }).filter(Boolean);

  // Set fixed top margin and dynamic bottom margin
  const topMargin = expandCanvas ? 220 : 0;

  // --- Begin dynamic right margin calculation ---
  const minSideMargin = expandCanvas ? Math.max(220, imageWidth * 0.4) : 0;
  const leftExtraPadding = 96; // was 64
  const rightExtraPadding = 128; // was 96
  const badgeRadius = 20;
  const rightEdgeBuffer = 48; // extra space between label text and SVG edge

  // Estimate max right label text width (SVG text, so use a rough multiplier)
  const rightLabelTexts = annotations
    .filter(ann => (ann.position.x + (ann.size?.width || 0) / 2) >= imageWidth / 2)
    .map(ann => ann.text || 'Add note...');
  const maxRightLabelLength = rightLabelTexts.length > 0 ? Math.max(...rightLabelTexts.map(t => t.length)) : 0;
  const approxCharWidth = 12; // px per character (SVG, sans-serif, fontSize=20)
  const maxRightLabelTextWidth = maxRightLabelLength * approxCharWidth;
  const rightLabelMargin = rightLabelTexts.length > 0 ? badgeRadius + rightExtraPadding + maxRightLabelTextWidth + rightEdgeBuffer : 0;

  // Use the larger of minSideMargin or rightLabelMargin for the right side
  const leftSideMargin = minSideMargin;
  const rightSideMargin = Math.max(minSideMargin, rightLabelMargin);

  const minSpacing = boxHeight + 16;
  // Count left/right labels
  const leftLabels = annotations.filter(ann => (ann.position.x + (ann.size?.width || 0) / 2) < imageWidth / 2);
  const rightLabels = annotations.length - leftLabels.length;
  const neededLabelHeight = Math.max(leftLabels.length, rightLabels) * minSpacing;
  const bottomMargin = expandCanvas ? Math.max(minSideMargin, neededLabelHeight) : 0;
  const svgWidth = imageWidth + leftSideMargin + rightSideMargin;
  const svgHeight = imageHeight + topMargin + bottomMargin;
  const imageX = leftSideMargin;
  const imageY = topMargin;

  // Compute labelFontSize for use in the input style
  const minLabelFontSize = 18;
  const maxLabelFontSize = 28;
  const labelFontSize = Math.max(minLabelFontSize, Math.min(maxLabelFontSize, Math.round(imageWidth * 0.022)));

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
    <div ref={containerRef} className="relative w-full" style={{ maxWidth: svgWidth }}>
      {/* Removed the HTML <img> tag here */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        width="100%"
        className="cursor-crosshair"
        style={{ height: 'auto', maxWidth: '100%', display: 'block' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
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
            fontFamily: 'Inter, Segoe UI, Helvetica Neue, Arial, sans-serif',
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