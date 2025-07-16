import React, { useRef, useState } from 'react';
import { BoardAnnotation, BoardAnnotationType } from '../types/annotation';

interface AnnotationOverlayProps {
  width: number;
  height: number;
  annotations: BoardAnnotation[];
  onChange: (annotations: BoardAnnotation[]) => void;
  tool: BoardAnnotationType;
  color: string;
}

const getDefaultLabelSide = (x: number) => (x < 0.5 ? 'left' : 'right');

const AnnotationOverlay: React.FC<AnnotationOverlayProps> = ({
  width,
  height,
  annotations,
  onChange,
  tool,
  color,
}) => {
  const [drawing, setDrawing] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [end, setEnd] = useState<{ x: number; y: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  // Add state for selected annotation and resizing
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; offset: { x: number; y: number } } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; corner: string } | null>(null);

  // Helper: get mouse coords relative to SVG (0-1)
  const getRelCoords = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / height)),
    };
  };

  // Helper: hit test for annotation
  const hitTest = (pt: { x: number; y: number }) => {
    for (let i = annotations.length - 1; i >= 0; --i) {
      const ann = annotations[i];
      const x = ann.relativePosition.x;
      const y = ann.relativePosition.y;
      const w = ann.relativeSize.width;
      const h = ann.relativeSize.height;
      if (ann.type === 'rectangle') {
        if (pt.x >= x && pt.x <= x + w && pt.y >= y && pt.y <= y + h) return ann.id;
      } else if (ann.type === 'circle' || ann.type === 'dot') {
        const cx = x + w / 2;
        const cy = y + h / 2;
        const rx = w / 2;
        const ry = h / 2;
        if (((pt.x - cx) ** 2) / (rx ** 2) + ((pt.y - cy) ** 2) / (ry ** 2) <= 1) return ann.id;
      }
    }
    return null;
  };

  // Mouse down handler
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((tool as string) === 'pointer') {
      const coords = getRelCoords(e);
      const hitId = hitTest(coords);
      if (hitId) {
        setSelectedId(hitId);
        // Check for resize handle
        const annSel = annotations.find(a => a.id === hitId);
        if (annSel && showResizeHandles(annSel)) {
          const handle = getResizeHandleAt(coords, annSel);
          if (handle) {
            setResizing({ id: hitId, corner: handle });
            return;
          }
        }
        // Start dragging
        if (annSel) {
          setDragging({ id: hitId, offset: { x: coords.x - annSel.relativePosition.x, y: coords.y - annSel.relativePosition.y } });
        }
      } else {
        setSelectedId(null);
      }
      return;
    }
    if ((tool as string) !== 'pointer') {
      const coords = getRelCoords(e);
      setDrawing(true);
      setStart(coords);
      setEnd(coords);
    }
  };

  // Mouse move handler
  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging) {
      const coords = getRelCoords(e);
      onChange(
        annotations.map(a =>
          a.id === dragging.id
            ? { ...a, relativePosition: { x: coords.x - dragging.offset.x, y: coords.y - dragging.offset.y } }
            : a
        )
      );
      return;
    }
    if (resizing) {
      const coords = getRelCoords(e);
      const annRes = annotations.find(a => a.id === resizing.id);
      if (!annRes) return;
      let { x, y } = annRes.relativePosition;
      let { width: w, height: h } = annRes.relativeSize;
      // Only support SE corner for now (bottom-right)
      if (resizing.corner === 'se') {
        w = Math.max(0.01, coords.x - x);
        h = Math.max(0.01, coords.y - y);
      }
      onChange(
        annotations.map(a =>
          a.id === resizing.id ? { ...a, relativeSize: { width: w, height: h } } : a
        )
      );
      return;
    }
    if (!drawing || !start) return;
    setEnd(getRelCoords(e));
  };

  // Mouse up handler
  const handleMouseUp = () => {
    if (dragging) setDragging(null);
    if (resizing) setResizing(null);
    if (!drawing || !start || !end) return;
    setDrawing(false);
    const relX = Math.min(start.x, end.x);
    const relY = Math.min(start.y, end.y);
    const relW = Math.abs(end.x - start.x);
    const relH = Math.abs(end.y - start.y);
    if (tool === 'rectangle' && relW > 0.01 && relH > 0.01) {
      const id = `ann-${Date.now()}-${Math.random()}`;
      const labelSide = getDefaultLabelSide(relX + relW / 2);
      const newAnn: BoardAnnotation = {
        id,
        type: 'rectangle',
        relativePosition: { x: relX, y: relY },
        relativeSize: { width: relW, height: relH },
        color,
        label: '',
        labelSide,
      };
      onChange([...annotations, newAnn]);
      setEditingId(id);
      setEditingText('');
    } else if (tool === 'circle' && relW > 0.01 && relH > 0.01) {
      const id = `ann-${Date.now()}-${Math.random()}`;
      const labelSide = getDefaultLabelSide(relX + relW / 2);
      const newAnn: BoardAnnotation = {
        id,
        type: 'circle',
        relativePosition: { x: relX, y: relY },
        relativeSize: { width: relW, height: relH },
        color,
        label: '',
        labelSide,
      };
      onChange([...annotations, newAnn]);
      setEditingId(id);
      setEditingText('');
    } else if (tool === 'dot') {
      const id = `ann-${Date.now()}-${Math.random()}`;
      const labelSide = getDefaultLabelSide(end.x);
      const size = 0.03;
      const newAnn: BoardAnnotation = {
        id,
        type: 'dot',
        relativePosition: { x: end.x - size / 2, y: end.y - size / 2 },
        relativeSize: { width: size, height: size },
        color,
        label: '',
        labelSide,
      };
      onChange([...annotations, newAnn]);
      setEditingId(id);
      setEditingText('');
    }
    setStart(null);
    setEnd(null);
  };

  // Select annotation for editing
  const handleAnnotationClick = (id: string, label: string) => {
    setEditingId(id);
    setEditingText(label);
  };

  // Commit label edit
  const commitLabelEdit = () => {
    if (editingId) {
      onChange(
        annotations.map(a =>
          a.id === editingId ? { ...a, label: editingText } : a
        )
      );
    }
    setEditingId(null);
    setEditingText('');
  };

  // Show resize handles for rectangles/circles
  const showResizeHandles = (ann: BoardAnnotation) => ann.type === 'rectangle' || ann.type === 'circle';
  // Get which resize handle is at a point (only SE for now)
  const getResizeHandleAt = (pt: { x: number; y: number }, ann: BoardAnnotation) => {
    const x = ann.relativePosition.x + ann.relativeSize.width;
    const y = ann.relativePosition.y + ann.relativeSize.height;
    const dist = Math.sqrt((pt.x - x) ** 2 + (pt.y - y) ** 2);
    if (dist < 0.03) return 'se';
    return null;
  };
  // Render resize handle
  const renderResizeHandle = (ann: BoardAnnotation, isSelected: boolean) => {
    if (!isSelected || !showResizeHandles(ann)) return null;
    const x = (ann.relativePosition.x + ann.relativeSize.width) * width;
    const y = (ann.relativePosition.y + ann.relativeSize.height) * height;
    return (
      <rect
        key={ann.id + '-resize'}
        x={x - 8}
        y={y - 8}
        width={16}
        height={16}
        fill="#fff"
        stroke="#1976d2"
        strokeWidth={2}
        style={{ cursor: 'nwse-resize' }}
      />
    );
  };

  // Render connector and label for each annotation
  const renderConnectorAndLabel = (ann: BoardAnnotation) => {
    // Calculate annotation center (relative)
    const cx = ann.relativePosition.x + ann.relativeSize.width / 2;
    const cy = ann.relativePosition.y + ann.relativeSize.height / 2;
    const px = cx * width;
    const py = cy * height;
    // Label position: outside image, left or right
    const labelMargin = 32;
    const labelX = ann.labelSide === 'left' ? -labelMargin : width + labelMargin;
    const labelY = py;
    // Connector: from annotation center to label
    return (
      <g key={ann.id + '-label'}>
        <line
          x1={px}
          y1={py}
          x2={labelX}
          y2={labelY}
          stroke={ann.color}
          strokeWidth={2}
          strokeDasharray="4 4"
        />
        {/* Label box */}
        <foreignObject
          x={ann.labelSide === 'left' ? labelX - 120 : labelX}
          y={labelY - 16}
          width={120}
          height={32}
          style={{ overflow: 'visible' }}
        >
          {editingId === ann.id ? (
            <input
              type="text"
              value={editingText}
              autoFocus
              style={{ width: '100%', fontSize: 14, border: '1px solid #1976d2', borderRadius: 4, padding: 2 }}
              onChange={e => setEditingText(e.target.value)}
              onBlur={commitLabelEdit}
              onKeyDown={e => {
                if (e.key === 'Enter') commitLabelEdit();
                if (e.key === 'Escape') { setEditingId(null); setEditingText(''); }
              }}
            />
          ) : (
            <div
              style={{
                background: '#fff',
                border: '1px solid #bbb',
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 14,
                color: '#222',
                minHeight: 24,
                minWidth: 40,
                cursor: 'pointer',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
              }}
              onClick={() => handleAnnotationClick(ann.id, ann.label)}
            >
              {ann.label || <span style={{ color: '#bbb' }}>Add label…</span>}
            </div>
          )}
        </foreignObject>
      </g>
    );
  };

  // Render annotation shapes
  const renderShape = (ann: BoardAnnotation) => {
    const x = ann.relativePosition.x * width;
    const y = ann.relativePosition.y * height;
    const w = ann.relativeSize.width * width;
    const h = ann.relativeSize.height * height;
    if (ann.type === 'rectangle') {
      return <rect key={ann.id} x={x} y={y} width={w} height={h} fill="none" stroke={ann.color} strokeWidth={2} />;
    }
    if (ann.type === 'circle') {
      return <ellipse key={ann.id} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="none" stroke={ann.color} strokeWidth={2} />;
    }
    if (ann.type === 'dot') {
      return <ellipse key={ann.id} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={ann.color} stroke="none" />;
    }
    // TODO: Pencil/freehand
    return null;
  };

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'auto', zIndex: 2 }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {annotations.map(renderShape)}
      {annotations.map(renderConnectorAndLabel)}
      {annotations.map(ann => renderResizeHandle(ann, ann.id === selectedId))}
      {/* Drawing preview */}
      {drawing && start && end && (tool as string) !== 'pointer' && (() => {
        const x = Math.min(start.x, end.x) * width;
        const y = Math.min(start.y, end.y) * height;
        const w = Math.abs(end.x - start.x) * width;
        const h = Math.abs(end.y - start.y) * height;
        if (tool === 'rectangle') return <rect x={x} y={y} width={w} height={h} fill="none" stroke={color} strokeWidth={2} opacity={0.5} />;
        if (tool === 'circle') return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="none" stroke={color} strokeWidth={2} opacity={0.5} />;
        if (tool === 'dot') return <ellipse cx={end.x * width} cy={end.y * height} rx={0.015 * width} ry={0.015 * height} fill={color} opacity={0.5} />;
        return null;
      })()}
    </svg>
  );
};

export default AnnotationOverlay; 