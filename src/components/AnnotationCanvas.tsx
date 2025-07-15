import React, { useRef, useState, RefObject, useCallback, useEffect } from 'react';
import { ToolType } from './Toolbar';
import { Annotation } from '../types/annotation';
import { Card, CardContent, Box, Typography, Button, IconButton, Stack, Paper } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import Tooltip from '@mui/material/Tooltip';

interface AnnotationCanvasProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  tool: ToolType;
  color: string;
  annotations: Annotation[];
  onAddAnnotation: (annotation: Omit<Annotation, 'id' | 'number'>) => Annotation;
  onUpdateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  onDeleteAnnotation?: (id: string) => void;
  selectedId: string | null;
  onSelectAnnotation: (id: string | null) => void;
  expandCanvas?: boolean;
  connectorColor?: string;
  connectorStyle?: 'solid' | 'dashed' | 'dotted';
  connectorThickness?: number;
  showLabelNumbers?: boolean;
  title?: string;
  onUpdateTitle?: (title: string) => void;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  autoFocusTitle?: boolean;
  onBack?: () => void; // Add back button handler
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
  onDeleteAnnotation,
  selectedId,
  onSelectAnnotation,
  expandCanvas = false,
  connectorColor = '#bbb',
  connectorStyle = 'dashed',
  connectorThickness = 2,
  showLabelNumbers = false,
  title = '',
  onUpdateTitle,
  svgRef: externalSvgRef,
  containerRef: externalContainerRef,
  autoFocusTitle = false,
  onBack,
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
  
  // Title editing state
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingTitleText, setEditingTitleText] = useState(title);
  const [titleInputPos, setTitleInputPos] = useState<{ x: number; y: number; width?: number; height?: number } | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleTextRef = useRef<SVGTextElement>(null);
  const [showTitleWarning, setShowTitleWarning] = useState(false);
  
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
        
        // Use the same logic as handleLabelClick to position the edit box inline with the label
        const labelEl = labelTextRefs.current[newAnnotation!.id];
        const container = containerRef.current;
        if (container && labelEl) {
          const containerRect = container.getBoundingClientRect();
          const labelRect = labelEl.getBoundingClientRect();
          setInputPos({
            x: labelRect.left - containerRect.left,
            y: labelRect.top - containerRect.top,
            width: labelRect.width,
            height: labelRect.height
          });
        } else {
          // Fallback: calculate approximate position based on annotation
          const center = getAnnotationCenter(newAnnotation);
          const isLeft = center.x < imageWidth / 2 + imageX;
          const labelBoxX = isLeft ? labelEdgeBuffer : svgWidth - 180 - labelEdgeBuffer;
          const labelBoxY = center.y - 20; // Approximate vertical position
          setInputPos({
            x: labelBoxX,
            y: labelBoxY,
            width: 180,
            height: 40
          });
        }
        
        setTimeout(() => {
          textareaRef.current?.focus();
        }, 0);
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
    
    // Get the label element and container to calculate exact position
    const labelEl = labelTextRefs.current[ann.id];
    const container = containerRef.current;
    
    if (container && labelEl) {
      const containerRect = container.getBoundingClientRect();
      const labelRect = labelEl.getBoundingClientRect();
      
      // Calculate position relative to container
      setInputPos({
        x: labelRect.left - containerRect.left,
        y: labelRect.top - containerRect.top,
        width: labelRect.width,
        height: labelRect.height
      });
    } else {
      // Fallback to approximate position
      setInputPos({ x, y });
    }
    
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

  // Handle title click for editing
  const handleTitleClick = () => {
    if (titleTextRef.current && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const titleRect = titleTextRef.current.getBoundingClientRect();
      setTitleInputPos({
        x: titleRect.left - containerRect.left,
        y: titleRect.top - containerRect.top,
        width: titleRect.width,
        height: titleRect.height
      });
    }
    setEditingTitle(true);
    setEditingTitleText(title);
    setTimeout(() => {
      titleInputRef.current?.focus();
    }, 0);
  };

  // Handle title edit commit
  const commitTitleEdit = () => {
    if (onUpdateTitle) {
      onUpdateTitle(editingTitleText);
    } else {
      setLocalTitle(editingTitleText);
    }
    setEditingTitle(false);
    setEditingTitleText('');
    setTitleInputPos(null);
  };

  // Handle annotation deletion
  const handleDeleteAnnotation = (id: string) => {
    if (onDeleteAnnotation) {
      onDeleteAnnotation(id);
      onSelectAnnotation(null);
    }
  };

  // Handle keyboard events for deletion
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle delete/backspace when not editing text
      if (editingLabelId || editingTitle) return;
      
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        handleDeleteAnnotation(selectedId);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, editingLabelId, editingTitle, onDeleteAnnotation]);

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
      const minBoxWidth = isLeft ? 180 : 100;
      const labelBoxWidth = Math.max(minBoxWidth, lines.reduce((max, line) => Math.max(max, line.length), 0) * labelFontSize * 0.6 + 24); // 24px padding
      const labelBoxHeight = height;
      // Label box position (top left)
      const labelBoxY = y;
      let labelBoxX: number;
      if (isLeft) {
        labelBoxX = labelEdgeBuffer;
      } else {
        labelBoxX = svgWidth - labelBoxWidth - labelEdgeBuffer;
      }
      const safeGap = isLeft ? 16 : 8; // px, less gap for right labels
      // Calculate width of the longest line of text for this label
      const longestLine = lines.reduce((max, line) => line.length > max.length ? line : max, '');
      const labelTextWidth = Math.max(labelFontSize * 0.6 * longestLine.length, 40);
      // For both left and right labels, set labelTextRenderX appropriately
      const labelTextRenderX = isLeft
        ? labelEdgeBuffer + safeGap
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
              style={{ 
                cursor: tool === 'pointer' ? 'move' : 'pointer', 
                userSelect: 'none', 
                fontFamily: 'Trebuchet MS, Inter, Segoe UI, Helvetica Neue, Arial, sans-serif',
                transition: 'fill 0.2s ease'
              }}
              onMouseDown={e => handleLabelMouseDown(e, ann, labelBadgeX, labelBadgeY)}
              onClick={e => {
                onSelectAnnotation(ann.id);
                handleLabelClick(ann, labelBadgeX, labelBadgeY);
              }}
              onMouseEnter={e => {
                if (tool === 'pointer') return;
                e.currentTarget.style.fill = '#2563eb';
              }}
              onMouseLeave={e => {
                if (tool === 'pointer') return;
                e.currentTarget.style.fill = (ann.text && ann.text.trim()) ? '#222' : '#bbb';
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

  // Render resize handles and delete button for selected annotation
  const renderResizeHandles = (ann: Annotation, isSelected: boolean) => {
    if (!isSelected) return null;
    
    const x = ann.position.x + imageX;
    const y = ann.position.y + imageY;
    const width = ann.size.width;
    const height = ann.size.height;
    const handleSize = 8;
    
    const elements: React.ReactNode[] = [];
    
    // Add resize handles for rectangle and circle
    if (ann.type === 'rectangle' || ann.type === 'circle') {
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
      
      handles.forEach((handle) => {
        elements.push(
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
        );
      });
    }
    
    // Add delete button for all annotation types
    const deleteButtonSize = 20;
    const deleteButtonX = x + width + 10;
    const deleteButtonY = y - 10;
    
    elements.push(
      <g key="delete-button" style={{ cursor: 'pointer' }}>
        {/* Delete button background */}
        <circle
          cx={deleteButtonX}
          cy={deleteButtonY}
          r={deleteButtonSize}
          fill="#ef4444"
          stroke="#fff"
          strokeWidth={2}
          onMouseDown={(e) => {
            e.stopPropagation();
            handleDeleteAnnotation(ann.id);
          }}
        />
        {/* Delete X symbol */}
        <text
          x={deleteButtonX}
          y={deleteButtonY + 6}
          textAnchor="middle"
          fill="#fff"
          fontSize={14}
          fontWeight="bold"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          ×
        </text>
      </g>
    );
    
    return elements;
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
  
  // Calculate minimum space needed for labels and title
  const titleHeight = 80; // Space needed for title (increased)
  const minTopSpace = Math.max(labelPadding + titleHeight, imageHeight / 30 + titleHeight);
  const minBottomSpace = Math.max(labelPadding, imageHeight / 15, maxLabelY - imageHeight / 2 + labelPadding);
  
  // Calculate total available height (assuming 80vh max height)
  const maxAvailableHeight = 800; // 80vh equivalent
  const totalLabelSpace = minTopSpace + minBottomSpace;
  const availableSpace = maxAvailableHeight - imageHeight;
  
  // Calculate margins to center the image
  let topMargin, bottomMargin;
  if (availableSpace >= totalLabelSpace) {
    // If we have enough space, center the image with equal margins
    const extraSpace = availableSpace - totalLabelSpace;
    topMargin = minTopSpace + extraSpace / 2;
    bottomMargin = minBottomSpace + extraSpace / 2;
  } else {
    // If not enough space, use minimum required margins
    topMargin = minTopSpace;
    bottomMargin = minBottomSpace;
  }

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
  // Define leftLabels and rightLabels before using them
  const leftLabels = annotations.filter(ann => {
    const center = ann.position.x + (ann.size?.width || 0) / 2;
    return center < imageWidth / 2;
  });
  const rightLabels = annotations.filter(ann => {
    const center = ann.position.x + (ann.size?.width || 0) / 2;
    return center >= imageWidth / 2;
  });
  // Calculate max label box width for left and right labels
  const maxLeftLabelBoxWidth = leftLabels.length > 0 ? Math.max(...leftLabels.map(ann => {
    const lines = getLabelWrappedLines(ann.text || 'Add note...');
    return Math.max(180, lines.reduce((max, line) => Math.max(max, line.length), 0) * approxCharWidth + 24);
  })) : 0;
  const maxRightLabelBoxWidth = rightLabels.length > 0 ? Math.max(...rightLabels.map(ann => {
    const lines = getLabelWrappedLines(ann.text || 'Add note...');
    return Math.max(100, lines.reduce((max, line) => Math.max(max, line.length), 0) * approxCharWidth + 24);
  })) : 0;
  // Use a single buffer for both left and right edges
  const labelEdgeBuffer = 40; // px, buffer from both edges
  // Set leftMargin and rightMargin to fit the widest label box plus buffer
  const leftMargin = maxLeftLabelBoxWidth + labelEdgeBuffer;
  const rightMargin = maxRightLabelBoxWidth + labelEdgeBuffer;
  const svgWidth = leftMargin + imageWidth + rightMargin;
  const svgHeight = imageHeight + topMargin;
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

  // Add state for extracted colors and copied color
  const [topColors, setTopColors] = useState<string[]>([]);
  const [copiedColor, setCopiedColor] = useState<string | null>(null);

  // Extract top colors when imageUrl changes
  useEffect(() => {
    if (!imageUrl) return;
    const img = new window.Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, img.width, img.height);
      const data = ctx.getImageData(0, 0, img.width, img.height).data;
      const colorCount: Record<string, number> = {};
      for (let i = 0; i < data.length; i += 4) {
        // Ignore fully transparent pixels
        if (data[i + 3] < 128) continue;
        // Reduce color depth for grouping (quantization)
        const r = Math.round(data[i] / 32) * 32;
        const g = Math.round(data[i + 1] / 32) * 32;
        const b = Math.round(data[i + 2] / 32) * 32;
        const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
        colorCount[hex] = (colorCount[hex] || 0) + 1;
      }
      // Sort by frequency and take top 40 as candidates
      const candidates = Object.entries(colorCount)
        .sort((a, b) => b[1] - a[1])
        .map(([hex]) => hex)
        .filter(hex => hex !== '#ffffff' && hex !== '#000000')
        .slice(0, 40);

      // Helper: hex to HSL
      function hexToHsl(hex) {
        let r = 0, g = 0, b = 0;
        if (hex.length === 7) {
          r = parseInt(hex.slice(1, 3), 16) / 255;
          g = parseInt(hex.slice(3, 5), 16) / 255;
          b = parseInt(hex.slice(5, 7), 16) / 255;
        }
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;
        if (max !== min) {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
          }
          h /= 6;
        }
        return { h: h * 360, s, l };
      }

      // Greedy selection for max hue diversity
      const selected: string[] = [];
      const hslCandidates = candidates.map(hex => ({ hex, hsl: hexToHsl(hex) }));
      if (hslCandidates.length > 0) {
        // Start with the most frequent
        selected.push(hslCandidates[0].hex);
        while (selected.length < 12 && hslCandidates.length > 0) {
          let bestIdx = -1;
          let bestMinDist = -1;
          for (let i = 0; i < hslCandidates.length; ++i) {
            if (selected.includes(hslCandidates[i].hex)) continue;
            // Compute min hue distance to already selected
            const hue = hslCandidates[i].hsl.h;
            let minDist = 360;
            for (const sel of selected) {
              const selHue = hslCandidates.find(c => c.hex === sel)?.hsl.h ?? 0;
              const d = Math.abs(hue - selHue);
              minDist = Math.min(minDist, Math.min(d, 360 - d));
            }
            if (minDist > bestMinDist) {
              bestMinDist = minDist;
              bestIdx = i;
            }
          }
          if (bestIdx !== -1) {
            selected.push(hslCandidates[bestIdx].hex);
          } else {
            break;
          }
        }
      }
      setTopColors(selected.slice(0, 12));
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Copy color to clipboard
  const handleCopyColor = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedColor(hex);
    setTimeout(() => setCopiedColor(null), 1200);
  };

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

  // Update editing title text when title prop changes
  useEffect(() => {
    setEditingTitleText(title);
  }, [title]);

  // Auto-focus title input if requested
  useEffect(() => {
    if (autoFocusTitle && !editingTitle) {
      setEditingTitle(true);
      setEditingTitleText(title);
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 100);
    }
  }, [autoFocusTitle, editingTitle, title]);

  // Add localTitle state at the top, after extracting title from props
  const [localTitle, setLocalTitle] = useState(title);

  // Use localTitle as fallback for title
  const displayTitle = typeof title === 'string' && title.length > 0 ? title : localTitle;

  // Calculate dynamic card width based on image width and margin for labels
  const cardMaxWidth = Math.min((imageWidth || 600) + 120, window.innerWidth * 0.98);

  // --- Improved: Recalculate title input position on zoom/pan/title change ---
  useEffect(() => {
    if (editingTitle && titleTextRef.current && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const titleRect = titleTextRef.current.getBoundingClientRect();
      setTitleInputPos({
        x: titleRect.left - containerRect.left,
        y: titleRect.top - containerRect.top,
        width: titleRect.width,
        height: titleRect.height
      });
    }
  }, [editingTitle, title, imageWidth, imageHeight]);
  // --- Improved: Recalculate label input position on zoom/pan/label text change ---
  useEffect(() => {
    if (editingLabelId && labelTextRefs.current[editingLabelId] && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const labelRect = labelTextRefs.current[editingLabelId].getBoundingClientRect();
      setInputPos({
        x: labelRect.left - containerRect.left,
        y: labelRect.top - containerRect.top,
        width: labelRect.width,
        height: labelRect.height
      });
    }
  }, [editingLabelId, editingText, annotations, imageWidth, imageHeight]);

  // Add state for editing the card header title
  const [editingHeaderTitle, setEditingHeaderTitle] = useState(false);
  const [headerTitleText, setHeaderTitleText] = useState(title);

  // Update headerTitleText when title prop changes
  useEffect(() => { setHeaderTitleText(title); }, [title]);

  // Handler to commit/cancel edit
  const commitHeaderTitleEdit = () => {
    setEditingHeaderTitle(false);
    if (headerTitleText.trim() && onUpdateTitle) {
      onUpdateTitle(headerTitleText.trim());
    }
  };
  const cancelHeaderTitleEdit = () => {
    setEditingHeaderTitle(false);
    setHeaderTitleText(title);
  };

  // Modern MUI Card layout
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mt: 2, mb: 3, gap: 2 }}>
        {/* Back button, perfectly aligned with project name */}
        {onBack && (
          <Tooltip title="Back to Gallery">
            <IconButton onClick={onBack} color="primary" sx={{ mr: 2 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M15 19l-7-7 7-7" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </IconButton>
          </Tooltip>
        )}
        <Typography variant="h4" fontWeight={800} color="text.primary" sx={{ mr: 2 }}>
          {editingHeaderTitle ? (
            <input
              value={headerTitleText}
              onChange={e => setHeaderTitleText(e.target.value)}
              onBlur={commitHeaderTitleEdit}
              onKeyDown={e => {
                if (e.key === 'Enter') commitHeaderTitleEdit();
                if (e.key === 'Escape') cancelHeaderTitleEdit();
              }}
              style={{
                fontSize: 32,
                fontWeight: 800,
                color: '#222',
                fontFamily: 'Inter, Segoe UI, Helvetica Neue, Arial, sans-serif',
                border: '2px solid #90caf9',
                borderRadius: 8,
                padding: '2px 16px',
                minWidth: 120,
                maxWidth: 400,
              }}
              autoFocus
            />
          ) : (
            <span
              style={{ cursor: 'pointer', userSelect: 'text' }}
              onClick={() => setEditingHeaderTitle(true)}
              title="Click to edit project name"
            >
              {title || 'Untitled Project'}
            </span>
          )}
          <span style={{ fontWeight: 400, color: '#888', fontSize: 28, marginLeft: 16 }}>– VizAudit</span>
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', width: '100%', py: 2 }}>
        <Card sx={{
          maxWidth: cardMaxWidth,
          width: '100%',
          borderRadius: 4,
          boxShadow: 8,
          p: 2,
          mx: 2,
        }}>
          <CardContent>
            {/* Only color palette and controls in the card header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5, mr: 2 }}>
                <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1 }}>
                  {topColors.slice(0, 6).map(hex => (
                    <Tooltip key={hex} title={copiedColor === hex ? 'Copied!' : hex} arrow>
                      <Box
                        onClick={() => handleCopyColor(hex)}
                        sx={{
                          width: 28,
                          height: 28,
                          borderRadius: 2,
                          background: hex,
                          border: '2px solid #eee',
                          cursor: 'pointer',
                          boxShadow: copiedColor === hex ? '0 0 0 2px #90caf9' : undefined,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                          transition: 'box-shadow 0.2s',
                        }}
                      >
                        {copiedColor === hex ? (
                          <CheckIcon sx={{ color: '#2563eb', fontSize: 18 }} />
                        ) : (
                          <ContentCopyIcon sx={{ color: '#fff', fontSize: 16, opacity: 0.7 }} />
                        )}
                      </Box>
                    </Tooltip>
                  ))}
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1, mt: 0.5 }}>
                  {topColors.slice(6, 12).map(hex => (
                    <Tooltip key={hex} title={copiedColor === hex ? 'Copied!' : hex} arrow>
                      <Box
                        onClick={() => handleCopyColor(hex)}
                        sx={{
                          width: 28,
                          height: 28,
                          borderRadius: 2,
                          background: hex,
                          border: '2px solid #eee',
                          cursor: 'pointer',
                          boxShadow: copiedColor === hex ? '0 0 0 2px #90caf9' : undefined,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                          transition: 'box-shadow 0.2s',
                        }}
                      >
                        {copiedColor === hex ? (
                          <CheckIcon sx={{ color: '#2563eb', fontSize: 18 }} />
                        ) : (
                          <ContentCopyIcon sx={{ color: '#fff', fontSize: 16, opacity: 0.7 }} />
                        )}
                      </Box>
                    </Tooltip>
                  ))}
                </Box>
              </Box>
              {/* Zoom controls and other tools remain here */}
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="outlined" onClick={handleZoomOut}>-</Button>
                <Button size="small" variant="outlined" onClick={handleZoomIn}>+</Button>
                <Button size="small" variant="outlined" onClick={handleZoomReset}>Reset</Button>
              </Stack>
            </Box>
            {/* Canvas area */}
            <Paper elevation={2} sx={{ p: 2, borderRadius: 3, bgcolor: 'grey.50', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Box ref={containerRef} sx={{ position: 'relative', width: imageWidth, height: imageHeight, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'auto', maxWidth: '100vw', maxHeight: '80vh' }}>
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
        
        {/* Render title above the image */}
        {!editingTitle && (
          <text
            ref={titleTextRef}
            x={imageX + imageWidth / 2}
            y={imageY - 40}
            textAnchor="middle"
            fill={displayTitle ? '#222' : '#bbb'}
            fontSize={Math.max(40, Math.min(56, Math.round(imageWidth * 0.06)))}
            fontWeight="bold"
            style={{ 
              cursor: 'pointer', 
              userSelect: 'none', 
              fontFamily: 'Trebuchet MS, Inter, Segoe UI, Helvetica Neue, Arial, sans-serif',
                        pointerEvents: 'auto',
                        zIndex: 2
            }}
            onClick={handleTitleClick}
          >
            {displayTitle || 'Click to add title...'}
          </text>
        )}
        
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
                    onBlur={commitLabelEdit}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitLabelEdit(); } if (e.key === 'Escape') setEditingLabelId(null); }}
          style={{
                      position: 'absolute',
            left: inputPos.x,
            top: inputPos.y,
                      width: inputPos.width,
                      height: inputPos.height,
                      fontSize: 16, // match SVG label font size
                      fontWeight: 500,
            color: '#222',
                      fontFamily: 'Trebuchet MS, Inter, Segoe UI, Helvetica Neue, Arial, sans-serif',
                      background: 'rgba(255,255,255,0.95)',
                      border: '2px solid #90caf9',
                      borderRadius: 8,
                      padding: '2px 8px',
                      zIndex: 10,
            resize: 'none',
                      boxSizing: 'border-box',
                    }}
                    autoFocus
                  />
                )}
      {/* Inline title editing input */}
      {editingTitle && titleInputPos && (
        <input
          ref={titleInputRef}
          value={editingTitleText}
          onChange={e => setEditingTitleText(e.target.value)}
                    onBlur={commitTitleEdit}
                    onKeyDown={e => { if (e.key === 'Enter') commitTitleEdit(); if (e.key === 'Escape') setEditingTitle(false); }}
          style={{
                      position: 'absolute',
            left: titleInputPos.x,
            top: titleInputPos.y,
                      width: titleInputPos.width,
                      height: titleInputPos.height,
                      fontSize: 32, // match SVG title font size
                      fontWeight: 800,
            color: '#222',
                      fontFamily: 'Inter, Segoe UI, Helvetica Neue, Arial, sans-serif',
                      background: 'rgba(255,255,255,0.95)',
                      border: '2px solid #90caf9',
                      borderRadius: 8,
                      padding: '2px 8px',
                      zIndex: 10,
                      boxSizing: 'border-box',
                    }}
                    autoFocus
                  />
                )}
              </Box>
            </Paper>
            {/* Toolbar or annotation controls can go here, using MUI Buttons/IconButtons */}
            {showTitleWarning && <div style={{color: 'red', fontWeight: 600, marginTop: 4}}>Please enter a project title before annotating.</div>}
          </CardContent>
        </Card>
      </Box>
    </>
  );
}; 