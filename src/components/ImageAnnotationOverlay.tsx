import React, { useRef, useState, useEffect } from 'react';
import { Annotation } from '../types/annotation';
import { ToolType } from './Toolbar';

interface ImageAnnotationOverlayProps {
  imageWidth: number;
  imageHeight: number;
  annotations: Annotation[];
  tool: ToolType;
  color: string;
  onAddAnnotation: (annotation: Omit<Annotation, 'id' | 'number'>) => Annotation;
  onUpdateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  onDeleteAnnotation?: (id: string) => void;
  selectedId: string | null;
  onSelectAnnotation: (id: string | null) => void;
  showLabelNumbers?: boolean;
  connectorColor?: string;
  connectorStyle?: 'solid' | 'dashed' | 'dotted';
  connectorThickness?: number;
}

export const ImageAnnotationOverlay: React.FC<ImageAnnotationOverlayProps> = ({
  imageWidth,
  imageHeight,
  annotations,
  tool,
  color,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  selectedId,
  onSelectAnnotation,
  showLabelNumbers = false,
  connectorColor = '#bbb',
  connectorStyle = 'dashed',
  connectorThickness = 2,
}) => {
  // Drawing state
  const [drawing, setDrawing] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [end, setEnd] = useState<{ x: number; y: number } | null>(null);
  const [pencilPath, setPencilPath] = useState<{ x: number; y: number }[]>([]);
  // Selection and editing state
  const [resizing, setResizing] = useState<{ id: string; corner: string } | null>(null);
  const [dragging, setDragging] = useState<{ id: string; offset: { x: number; y: number } } | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingLabelPos, setEditingLabelPos] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Convert mouse event to SVG coordinates
  const getSvgCoords = (e: React.MouseEvent) => {
    const svg = svgRef.current || (e.currentTarget as SVGSVGElement);
    const rect = svg.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  // Hit test for annotation
  function isPointInAnnotation(point: { x: number; y: number }, ann: Annotation): boolean {
    if (ann.type === 'rectangle' || ann.type === 'solid-circle') {
      return (
        point.x >= ann.position.x &&
        point.x <= ann.position.x + ann.size.width &&
        point.y >= ann.position.y &&
        point.y <= ann.position.y + ann.size.height
      );
    }
    if (ann.type === 'circle') {
      const cx = ann.position.x + ann.size.width / 2;
      const cy = ann.position.y + ann.size.height / 2;
      const rx = ann.size.width / 2;
      const ry = ann.size.height / 2;
      return (
        ((point.x - cx) ** 2) / (rx ** 2) + ((point.y - cy) ** 2) / (ry ** 2) <= 1
      );
    }
    return false;
  }

  // Mouse down handler
  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool === 'pointer') {
      const coords = getSvgCoords(e);
      // Check for resize handle
      if (selectedId) {
        const ann = annotations.find(a => a.id === selectedId);
        if (ann) {
          const handle = getResizeHandleAtPoint(coords, ann);
          if (handle) {
            setResizing({ id: ann.id, corner: handle });
            e.stopPropagation();
            return;
          }
        }
      }
      // Hit test for annotation selection
      const hit = [...annotations].reverse().find(ann => isPointInAnnotation(coords, ann));
      if (hit) {
        onSelectAnnotation(hit.id);
        // Start dragging
        setDragging({ id: hit.id, offset: { x: coords.x - hit.position.x, y: coords.y - hit.position.y } });
      } else {
        onSelectAnnotation(null);
      }
      return;
    }
    // Drawing mode
    const coords = getSvgCoords(e);
    setDrawing(true);
    setStart(coords);
    setEnd(coords);
    if (tool === 'pencil') {
      setPencilPath([coords]);
    }
  };

  // Mouse move handler
  const handleMouseMove = (e: React.MouseEvent) => {
    if (tool === 'pointer') {
      if (resizing && selectedId) {
        const ann = annotations.find(a => a.id === selectedId);
        if (!ann) return;
        const coords = getSvgCoords(e);
        let { x, y, width, height } = { ...ann.position, ...ann.size };
        switch (resizing.corner) {
          case 'se':
            width = Math.max(10, coords.x - x);
            height = Math.max(10, coords.y - y);
            break;
          case 'sw':
            width = Math.max(10, width + (x - coords.x));
            height = Math.max(10, coords.y - y);
            x = coords.x;
            break;
          case 'ne':
            width = Math.max(10, coords.x - x);
            height = Math.max(10, height + (y - coords.y));
            y = coords.y;
            break;
          case 'nw':
            width = Math.max(10, width + (x - coords.x));
            height = Math.max(10, height + (y - coords.y));
            x = coords.x;
            y = coords.y;
            break;
        }
        onUpdateAnnotation(selectedId, { position: { x, y }, size: { width, height } });
        return;
      }
      if (dragging && selectedId) {
        const coords = getSvgCoords(e);
        onUpdateAnnotation(selectedId, {
          position: { x: coords.x - dragging.offset.x, y: coords.y - dragging.offset.y },
        });
        return;
      }
      return;
    }
    // Drawing mode
    if (!drawing || !start) return;
    const coords = getSvgCoords(e);
    setEnd(coords);
    if (tool === 'pencil') {
      setPencilPath(path => [...path, coords]);
    }
  };

  // Mouse up handler
  const handleMouseUp = (e: React.MouseEvent) => {
    if (tool === 'pointer') {
      setDragging(null);
      setResizing(null);
      return;
    }
    if (!drawing || !start) return;
    setDrawing(false);
    if (tool === 'pencil' && pencilPath.length > 1) {
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
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
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
      const fixedSize = 14;
      const centerX = end.x;
      const centerY = end.y;
      newAnnotation = onAddAnnotation({
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

  // Resize handle hit test
  function getResizeHandleAtPoint(point: { x: number; y: number }, ann: Annotation): string | null {
    if (!['rectangle', 'circle', 'solid-circle'].includes(ann.type)) return null;
    const handles = [
      { corner: 'nw', x: ann.position.x, y: ann.position.y },
      { corner: 'ne', x: ann.position.x + ann.size.width, y: ann.position.y },
      { corner: 'sw', x: ann.position.x, y: ann.position.y + ann.size.height },
      { corner: 'se', x: ann.position.x + ann.size.width, y: ann.position.y + ann.size.height },
    ];
    for (const h of handles) {
      if (Math.abs(point.x - h.x) < 8 && Math.abs(point.y - h.y) < 8) return h.corner;
    }
    return null;
  }

  // Double-click to edit label
  const handleAnnotationDoubleClick = (ann: Annotation) => {
    setEditingLabelId(ann.id);
    setEditingText(ann.text || '');
  };

  // Update handleAnnotationLabelEdit to always set both id and position
  const handleAnnotationLabelEdit = (ann: Annotation, x: number, y: number) => {
    setEditingLabelId(ann.id);
    setEditingText(ann.text || '');
    setEditingLabelPos({ x, y });
  };

  // Commit label edit and clear editingLabelPos
  const commitLabelEdit = () => {
    if (editingLabelId) {
      onUpdateAnnotation(editingLabelId, { text: editingText });
    }
    setEditingLabelId(null);
    setEditingText('');
    setEditingLabelPos(null);
  };

  // Delete selected annotation with Delete/Backspace
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && onDeleteAnnotation) {
        onDeleteAnnotation(selectedId);
        onSelectAnnotation(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, onDeleteAnnotation, onSelectAnnotation]);

  // Render preview shape while drawing
  const renderPreview = () => {
    if (!drawing || !start || !end) return null;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (tool === 'rectangle') {
      return <rect x={x} y={y} width={width} height={height} fill="none" stroke={color} strokeWidth={2} opacity={0.7} />;
    }
    if (tool === 'circle') {
      return <ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} fill="none" stroke={color} strokeWidth={2} opacity={0.7} />;
    }
    if (tool === 'solid-circle') {
      const fixedSize = 14;
      return <ellipse cx={end.x} cy={end.y} rx={fixedSize / 2} ry={fixedSize / 2} fill={color} opacity={0.7} />;
    }
    if (tool === 'pencil') {
      return <polyline points={pencilPath.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth={2} opacity={0.7} />;
    }
    return null;
  };

  // Render resize handles
  const renderResizeHandles = (ann: Annotation, isSelected: boolean) => {
    if (!isSelected || !['rectangle', 'circle', 'solid-circle'].includes(ann.type)) return null;
    const corners = [
      { corner: 'nw', x: ann.position.x, y: ann.position.y },
      { corner: 'ne', x: ann.position.x + ann.size.width, y: ann.position.y },
      { corner: 'sw', x: ann.position.x, y: ann.position.y + ann.size.height },
      { corner: 'se', x: ann.position.x + ann.size.width, y: ann.position.y + ann.size.height },
    ];
    return corners.map(h => (
      <rect
        key={h.corner}
        x={h.x - 5}
        y={h.y - 5}
        width={10}
        height={10}
        fill="#fff"
        stroke="#2563eb"
        strokeWidth={2}
        style={{ cursor: `${h.corner}-resize` }}
      />
    ));
  };

  // --- Label and connector rendering ---
  const labelFontSize = 14;
  const badgeFontSize = 13;
  const badgeRadius = 13;
  const labelEdgeBuffer = 12;
  const labelMargin = 16;
  const svgWidth = imageWidth;
  const imageX = 0;
  const imageY = 0;
  // Helper: get annotation center
  const getAnnotationCenter = (ann: Annotation) => {
    if (ann.type === 'rectangle' || ann.type === 'circle') {
      return {
        x: ann.position.x + ann.size.width / 2 + imageX,
        y: ann.position.y + ann.size.height / 2 + imageY,
      };
    } else if (ann.type === 'pencil' && Array.isArray(ann.points) && ann.points.length > 0) {
      return {
        x: ann.points[0].x,
        y: ann.points[0].y
      };
    }
    return { x: ann.position.x + imageX, y: ann.position.y + imageY };
  };
  // Helper: get badge (connector start) position
  const getBadgeCenter = (ann: Annotation, labelBadgeX: number, labelBadgeY: number) => {
    if (ann.type === 'rectangle') {
      const x = ann.position.x + imageX;
      const y = ann.position.y + imageY;
      const w = ann.size.width;
      const h = ann.size.height;
      const cx = x + w / 2;
      const cy = y + h / 2;
      const dx = labelBadgeX - cx;
      const dy = labelBadgeY - cy;
      let tx = 0, ty = 0;
      if (Math.abs(dx / w) > Math.abs(dy / h)) {
        tx = dx > 0 ? w / 2 : -w / 2;
        ty = (dy / dx) * tx;
      } else {
        ty = dy > 0 ? h / 2 : -h / 2;
        tx = (dx / dy) * ty;
      }
      return { x: cx + tx, y: cy + ty };
    } else if (ann.type === 'circle') {
      const cx = ann.position.x + ann.size.width / 2 + imageX;
      const cy = ann.position.y + ann.size.height / 2 + imageY;
      const rx = ann.size.width / 2;
      const ry = ann.size.height / 2;
      const dx = labelBadgeX - cx;
      const dy = labelBadgeY - cy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      return {
        x: cx + (dx / len) * rx,
        y: cy + (dy / len) * ry,
      };
    } else if (ann.type === 'solid-circle') {
      return {
        x: ann.position.x + ann.size.width / 2 + imageX,
        y: ann.position.y + ann.size.height / 2 + imageY,
      };
    } else if (ann.type === 'pencil' && Array.isArray(ann.points) && ann.points.length > 0) {
      return {
        x: ann.points[0].x,
        y: ann.points[0].y
      };
    }
    return { x: ann.position.x + imageX, y: ann.position.y + imageY };
  };
  // --- Render labels and connectors ---
  const renderLabelsAndConnectors = () => {
    const lineHeight = labelFontSize * 1.2;
    const labelPadding = 12;
    const minGap = 4;
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
    const left: { ann: Annotation; lines: string[]; height: number }[] = [];
    const right: { ann: Annotation; lines: string[]; height: number }[] = [];
    annotations.forEach(ann => {
      const center = getAnnotationCenter(ann);
      if (center.x < imageWidth / 2 + imageX) left.push(getLabelInfo(ann));
      else right.push(getLabelInfo(ann));
    });
    left.sort((a, b) => getAnnotationCenter(a.ann).y - getAnnotationCenter(b.ann).y);
    right.sort((a, b) => getAnnotationCenter(a.ann).y - getAnnotationCenter(b.ann).y);
    const availableTop = imageY;
    const availableBottom = imageY + imageHeight;
    const placeLabels = (arr: { ann: Annotation; lines: string[]; height: number }[]): number[] => {
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
    const labelRenderList: Array<{ ann: Annotation; lines: string[]; height: number; y: number; isLeft: boolean }> = [
      ...left.map((info, i) => ({...info, y: leftYs[i], isLeft: true})),
      ...right.map((info, i) => ({...info, y: rightYs[i], isLeft: false})),
    ];
    labelRenderList.sort((a, b) => getAnnotationCenter(a.ann).y - getAnnotationCenter(b.ann).y);
    let leftConnectorIndex = 0, rightConnectorIndex = 0;
    let leftConnectorCount = left.length, rightConnectorCount = right.length;
    const rightEdgeX = imageWidth + imageX + labelMargin;
    return labelRenderList.map((info) => {
      const { ann, lines, height, y, isLeft } = info;
      const minBoxWidth = isLeft ? 180 : 100;
      const labelBoxWidth = Math.max(minBoxWidth, lines.reduce((max, line) => Math.max(max, line.length), 0) * labelFontSize * 0.6 + 24);
      const labelBoxHeight = height;
      const labelBoxY = y;
      let labelBoxX: number;
      if (isLeft) {
        labelBoxX = labelEdgeBuffer;
      } else {
        labelBoxX = svgWidth - labelBoxWidth - labelEdgeBuffer;
      }
      const safeGap = isLeft ? 16 : 8;
      const longestLine = lines.reduce((max, line) => line.length > max.length ? line : max, '');
      const labelTextWidth = Math.max(labelFontSize * 0.6 * longestLine.length, 40);
      const labelTextRenderX = isLeft
        ? labelEdgeBuffer + safeGap
        : labelBoxX + labelBoxWidth - safeGap;
      const connectorEndX = isLeft
        ? labelTextRenderX + labelTextWidth
        : labelTextRenderX - labelTextWidth;
      const connectorEndY = labelBoxY + (lines.length * labelFontSize * 1.2) / 2 + 4;
      const labelBadgeX = isLeft ? imageX - badgeRadius : imageWidth + imageX + badgeRadius;
      const labelBadgeY = connectorEndY;
      const badgeStart = getBadgeCenter(ann, labelBadgeX, labelBadgeY);
      let connectorIndex = isLeft ? leftConnectorIndex++ : rightConnectorIndex++;
      let connectorsOnThisSide = isLeft ? leftConnectorCount : rightConnectorCount;
      const elbowSpread = 80;
      const elbowCenter = (badgeStart.x + labelBadgeX) / 2;
      const elbowMin = elbowCenter - elbowSpread / 2;
      let midwayX = elbowCenter;
      if (connectorsOnThisSide > 1) {
        midwayX = elbowMin + (connectorIndex * (elbowSpread / (connectorsOnThisSide - 1)));
      }
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
          {/* Label text */}
          <text
            x={labelTextRenderX}
            y={labelBoxY + labelFontSize + 4}
            textAnchor={isLeft ? 'start' : 'end'}
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
            onMouseDown={e => { if (tool === 'pointer') e.stopPropagation(); }}
            onDoubleClick={() => handleAnnotationLabelEdit(ann, labelTextRenderX, labelBoxY + labelFontSize + 4)}
            onClick={() => handleAnnotationLabelEdit(ann, labelTextRenderX, labelBoxY + labelFontSize + 4)}
          >
            {lines.map((line, i) => (
              <tspan key={i} x={labelTextRenderX} dy={i === 0 ? 0 : labelFontSize * 1.2}>
                {line || '\u00A0'}
              </tspan>
            ))}
          </text>
          {/* Label editing input at label position */}
          {editingLabelId === ann.id && editingLabelPos && (
            <foreignObject
              x={editingLabelPos.x}
              y={editingLabelPos.y - 20}
              width={180}
              height={28}
            >
              <input
                type="text"
                value={editingText}
                autoFocus
                style={{ width: '100%', fontSize: 14 }}
                onChange={e => setEditingText(e.target.value)}
                onBlur={commitLabelEdit}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitLabelEdit();
                  if (e.key === 'Escape') { setEditingLabelId(null); setEditingText(''); setEditingLabelPos(null); }
                }}
              />
            </foreignObject>
          )}
        </g>
      );
    });
  };

  return (
    <svg
      ref={svgRef}
      width={imageWidth}
      height={imageHeight}
      style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'auto', zIndex: 2 }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {annotations.map((ann, idx) => {
        const isSelected = ann.id === selectedId;
        // Main shape
        let shape = null;
        if (ann.type === 'rectangle') {
          shape = (
            <rect
              x={ann.position.x}
              y={ann.position.y}
              width={ann.size.width}
              height={ann.size.height}
              fill="none"
              stroke={isSelected ? '#2563eb' : ann.color}
              strokeWidth={isSelected ? 3 : 2}
              onDoubleClick={() => handleAnnotationDoubleClick(ann)}
              style={{ cursor: tool === 'pointer' ? 'move' : 'crosshair' }}
            />
          );
        } else if (ann.type === 'circle') {
          shape = (
            <ellipse
              cx={ann.position.x + ann.size.width / 2}
              cy={ann.position.y + ann.size.height / 2}
              rx={ann.size.width / 2}
              ry={ann.size.height / 2}
              fill="none"
              stroke={isSelected ? '#2563eb' : ann.color}
              strokeWidth={isSelected ? 3 : 2}
              onDoubleClick={() => handleAnnotationDoubleClick(ann)}
              style={{ cursor: tool === 'pointer' ? 'move' : 'crosshair' }}
            />
          );
        } else if (ann.type === 'solid-circle') {
          shape = (
            <ellipse
              cx={ann.position.x + ann.size.width / 2}
              cy={ann.position.y + ann.size.height / 2}
              rx={ann.size.width / 2}
              ry={ann.size.height / 2}
              fill={ann.color}
              stroke={isSelected ? '#2563eb' : 'none'}
              strokeWidth={isSelected ? 3 : 0}
              onDoubleClick={() => handleAnnotationDoubleClick(ann)}
              style={{ cursor: tool === 'pointer' ? 'move' : 'crosshair' }}
            />
          );
        } else if (ann.type === 'pencil' && ann.points) {
          shape = (
            <polyline
              points={ann.points.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={isSelected ? '#2563eb' : ann.color}
              strokeWidth={isSelected ? 3 : 2}
              onDoubleClick={() => handleAnnotationDoubleClick(ann)}
              style={{ cursor: tool === 'pointer' ? 'move' : 'crosshair' }}
            />
          );
        }
        // Label
        let label = null;
        if (ann.text && ann.text.length > 0) {
          label = (
            <text
              x={ann.position.x + 8}
              y={ann.position.y - 8}
              fontSize={14}
              fill="#222"
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              {ann.text}
            </text>
          );
        }
        if (!shape) {
          // If the annotation type is not recognized, return an empty group
          return <g key={ann.id} />;
        }
        return (
          <g key={ann.id} onMouseDown={tool === 'pointer' ? (e) => { e.stopPropagation(); onSelectAnnotation(ann.id); } : undefined}>
            {shape}
            {renderResizeHandles(ann, isSelected && tool === 'pointer')}
            {label}
            {/* Label editing input */}
            {editingLabelId === ann.id && (
              <foreignObject
                x={ann.position.x + 8}
                y={ann.position.y - 28}
                width={120}
                height={28}
              >
                <input
                  type="text"
                  value={editingText}
                  autoFocus
                  style={{ width: '100%', fontSize: 14 }}
                  onChange={e => setEditingText(e.target.value)}
                  onBlur={commitLabelEdit}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitLabelEdit();
                    if (e.key === 'Escape') { setEditingLabelId(null); setEditingText(''); }
                  }}
                />
              </foreignObject>
            )}
          </g>
        );
      })}
      {renderLabelsAndConnectors()}
      {renderPreview()}
    </svg>
  );
}; 