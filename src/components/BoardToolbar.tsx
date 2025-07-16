import React, { useEffect } from 'react';
import { Box, Paper, IconButton, ToggleButtonGroup, ToggleButton, Tooltip } from '@mui/material';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import Crop75Icon from '@mui/icons-material/Crop75';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import EditIcon from '@mui/icons-material/Edit';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PaletteIcon from '@mui/icons-material/Palette';
import { BoardAnnotationType } from '../types/annotation';

interface BoardToolbarProps {
  selectedTool: BoardAnnotationType;
  onSelectTool: (tool: BoardAnnotationType) => void;
  color: string;
  onColorChange: (color: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
}

const toolOptions: { value: BoardAnnotationType; icon: React.ReactNode; label: string }[] = [
  { value: 'pointer', icon: <NorthEastIcon />, label: 'Select/Move' },
  { value: 'rectangle', icon: <Crop75Icon />, label: 'Rectangle' },
  { value: 'circle', icon: <RadioButtonUncheckedIcon />, label: 'Circle' },
  { value: 'dot', icon: <FiberManualRecordIcon />, label: 'Dot' },
  { value: 'pencil', icon: <EditIcon />, label: 'Pencil' },
];

const colorOptions = ['#1976d2', '#e53935', '#43a047', '#fbc02d', '#8e24aa', '#222', '#fff'];

const BoardToolbar: React.FC<BoardToolbarProps> = ({
  selectedTool,
  onSelectTool,
  color,
  onColorChange,
  onUndo,
  onRedo,
  onExport,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        onUndo();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        onRedo();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'v':
            onSelectTool('pointer');
            break;
          case 'r':
            onSelectTool('rectangle');
            break;
          case 'c':
            onSelectTool('circle');
            break;
          case 's':
            onSelectTool('dot');
            break;
          case 'p':
            onSelectTool('pencil');
            break;
          case 'e':
            onExport();
            break;
          default:
            break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSelectTool, onUndo, onRedo, onExport]);
  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        left: 0,
        bottom: 0,
        width: '100vw',
        zIndex: 100,
        py: 1.5,
        px: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        borderRadius: 0,
        boxShadow: '0 -2px 16px rgba(0,0,0,0.08)',
        bgcolor: '#fff',
      }}
    >
      {/* Tool selection */}
      <ToggleButtonGroup
        value={selectedTool}
        exclusive
        onChange={(_, val) => val && onSelectTool(val)}
        sx={{ mr: 4 }}
      >
        {toolOptions.map((tool) => (
          <ToggleButton key={tool.value} value={tool.value} sx={{ px: 2, py: 1 }}>
            <Tooltip title={tool.label} placement="top">
              {tool.icon}
            </Tooltip>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {/* Color picker */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 4 }}>
        <PaletteIcon sx={{ color: color, mr: 1 }} />
        {colorOptions.map((c) => (
          <Box
            key={c}
            onClick={() => onColorChange(c)}
            sx={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              bgcolor: c,
              border: c === color ? '2px solid #1976d2' : '2px solid #eee',
              cursor: 'pointer',
              boxShadow: c === color ? 2 : 0,
              transition: 'border 0.2s',
            }}
          />
        ))}
      </Box>
      {/* Undo/Redo/Export */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Tooltip title="Undo">
          <IconButton onClick={onUndo}><UndoIcon /></IconButton>
        </Tooltip>
        <Tooltip title="Redo">
          <IconButton onClick={onRedo}><RedoIcon /></IconButton>
        </Tooltip>
        <Tooltip title="Export">
          <IconButton onClick={onExport}><FileDownloadIcon /></IconButton>
        </Tooltip>
      </Box>
    </Paper>
  );
};

export default BoardToolbar; 