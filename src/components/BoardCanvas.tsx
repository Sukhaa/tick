import React, { useState } from 'react';
import { Box } from '@mui/material';
import BoardImageCard from './BoardImageCard';
import { BoardImageV2, BoardAnnotationType } from '../types/annotation';

interface BoardCanvasProps {
  images: BoardImageV2[];
  onUpdateImage: (id: string, updates: Partial<BoardImageV2>) => void;
  onAnnotationChange: (id: string, annotations: BoardImageV2['annotations']) => void;
  selectedImageId: string | null;
  onSelectImage: (id: string) => void;
  tool: BoardAnnotationType;
  color: string;
}

const BoardCanvas: React.FC<BoardCanvasProps> = ({
  images,
  onUpdateImage,
  onAnnotationChange,
  selectedImageId,
  onSelectImage,
  tool,
  color,
}) => {
  return (
    <Box sx={{ width: '100%', height: '80vh', position: 'relative', bgcolor: '#f7f7fa', borderRadius: 3 }}>
      {images.map((img) => (
        <BoardImageCard
          key={img.id}
          image={img}
          selected={selectedImageId === img.id}
          onSelect={() => onSelectImage(img.id)}
          onUpdate={(updates) => onUpdateImage(img.id, updates)}
          onAnnotationChange={(annotations) => onAnnotationChange(img.id, annotations)}
          tool={tool}
          color={color}
        />
      ))}
    </Box>
  );
};

export default BoardCanvas; 