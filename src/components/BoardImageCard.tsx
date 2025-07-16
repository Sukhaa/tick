import React, { useRef, useState } from 'react';
import { Box, Paper, IconButton } from '@mui/material';
import { BoardImageV2, BoardAnnotation, BoardAnnotationType } from '../types/annotation';
import AnnotationOverlay from './AnnotationOverlay';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import EditIcon from '@mui/icons-material/Edit';

interface BoardImageCardProps {
  image: BoardImageV2;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<BoardImageV2>) => void;
  onAnnotationChange: (annotations: BoardAnnotation[]) => void;
  tool: BoardAnnotationType;
  color: string;
}

const BoardImageCard: React.FC<BoardImageCardProps> = ({
  image,
  selected,
  onSelect,
  onUpdate,
  onAnnotationChange,
  tool,
  color,
}) => {
  const [resizing, setResizing] = useState<null | { startX: number; startY: number; startW: number; startH: number }>();
  const [draggingCard, setDraggingCard] = useState<null | { startX: number; startY: number; startLeft: number; startTop: number }>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Handle resize drag
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setResizing({
      startX: e.clientX,
      startY: e.clientY,
      startW: image.width,
      startH: image.height,
    });
    window.addEventListener('mousemove', handleResizeMouseMove);
    window.addEventListener('mouseup', handleResizeMouseUp);
  };
  const handleResizeMouseMove = (e: MouseEvent) => {
    if (!resizing) return;
    const newW = Math.max(120, resizing.startW + (e.clientX - resizing.startX));
    const newH = Math.max(80, resizing.startH + (e.clientY - resizing.startY));
    onUpdate({ width: newW, height: newH });
  };
  const handleResizeMouseUp = () => {
    setResizing(null);
    window.removeEventListener('mousemove', handleResizeMouseMove);
    window.removeEventListener('mouseup', handleResizeMouseUp);
  };

  // Handle card drag start
  const handleCardMouseDown = (e: React.MouseEvent) => {
    if (!selected) return;
    // Only drag if not clicking the resize handle
    const target = e.target as HTMLElement;
    if (target.closest('.resize-handle')) return;
    e.stopPropagation();
    setDraggingCard({
      startX: e.clientX,
      startY: e.clientY,
      startLeft: image.x,
      startTop: image.y,
    });
    window.addEventListener('mousemove', handleCardMouseMove);
    window.addEventListener('mouseup', handleCardMouseUp);
  };
  const handleCardMouseMove = (e: MouseEvent) => {
    if (!draggingCard) return;
    const dx = e.clientX - draggingCard.startX;
    const dy = e.clientY - draggingCard.startY;
    onUpdate({ x: draggingCard.startLeft + dx, y: draggingCard.startTop + dy });
  };
  const handleCardMouseUp = () => {
    setDraggingCard(null);
    window.removeEventListener('mousemove', handleCardMouseMove);
    window.removeEventListener('mouseup', handleCardMouseUp);
  };

  const LABEL_MARGIN = 32; // connector length
  const LABEL_BOX_WIDTH = 120; // label box width
  const LABEL_TOTAL = LABEL_MARGIN + LABEL_BOX_WIDTH + 8; // total needed per side

  // Calculate required left/right margin
  let leftMargin = 0;
  let rightMargin = 0;
  if (image.annotations && image.annotations.length > 0) {
    for (const ann of image.annotations) {
      if (ann.label && ann.label.trim()) {
        if (ann.labelSide === 'left') leftMargin = LABEL_TOTAL;
        if (ann.labelSide === 'right') rightMargin = LABEL_TOTAL;
      }
    }
  }
  const cardWidth = image.width + leftMargin + rightMargin;

  return (
    <Paper
      ref={cardRef}
      elevation={selected ? 8 : 2}
      sx={{
        position: 'absolute',
        left: image.x - leftMargin,
        top: image.y,
        width: cardWidth,
        height: image.height,
        border: selected ? '2px solid #1976d2' : '2px solid #eee',
        borderRadius: 3,
        boxShadow: selected ? 6 : 2,
        overflow: 'visible',
        zIndex: selected ? 2 : 1,
        transition: 'border 0.1s',
        cursor: selected ? (draggingCard ? 'grabbing' : 'grab') : 'default',
        userSelect: 'none',
      }}
      onClick={onSelect}
      onMouseDown={handleCardMouseDown}
    >
      {/* Image */}
      <Box sx={{ position: 'absolute', left: leftMargin, top: 0, width: image.width, height: image.height }}>
        <img
          src={image.url}
          alt={image.fileName}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }}
        />
        {/* Annotation Overlay */}
        <AnnotationOverlay
          width={image.width}
          height={image.height}
          annotations={image.annotations}
          onChange={onAnnotationChange}
          tool={tool}
          color={color}
        />
      </Box>
      {/* Resize handle (bottom right) */}
      {selected && (
        <Box
          className="resize-handle"
          sx={{
            position: 'absolute',
            right: -10,
            bottom: -10,
            width: 20,
            height: 20,
            bgcolor: '#fff',
            border: '2px solid #1976d2',
            borderRadius: 2,
            boxShadow: 2,
            cursor: 'nwse-resize',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseDown={handleResizeMouseDown}
        >
          <CropSquareIcon fontSize="small" color="primary" />
        </Box>
      )}
    </Paper>
  );
};

export default BoardImageCard; 