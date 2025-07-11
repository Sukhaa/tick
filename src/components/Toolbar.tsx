import React, { useEffect } from 'react';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import Crop75Icon from '@mui/icons-material/Crop75';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import LinearScaleIcon from '@mui/icons-material/LinearScale';
import UndoIcon from '@mui/icons-material/Undo';
import BackspaceIcon from '@mui/icons-material/Backspace';

export type ToolType = 'pointer' | 'rectangle' | 'circle' | 'solid-circle';

interface ToolbarProps {
  selectedTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  color: string;
  onColorChange: (color: string) => void;
  connectorStyle: 'solid' | 'dashed' | 'dotted';
  onConnectorStyleChange: (style: 'solid' | 'dashed' | 'dotted') => void;
  connectorColor: string;
  onConnectorColorChange: (color: string) => void;
  connectorThickness: number;
  onConnectorThicknessChange: (thickness: number) => void;
  onUndo: () => void;
  onClearAll: () => void;
}

const tools: { type: ToolType; label: string; icon: React.ReactNode }[] = [
  {
    type: 'pointer',
    label: 'Pointer',
    icon: <NorthEastIcon fontSize="medium" />,
  },
  {
    type: 'rectangle',
    label: 'Rectangle',
    icon: <Crop75Icon fontSize="medium" />,
  },
  {
    type: 'circle',
    label: 'Circle',
    icon: <RadioButtonUncheckedIcon fontSize="medium" />,
  },
  {
    type: 'solid-circle',
    label: 'Solid Circle',
    icon: <FiberManualRecordIcon fontSize="medium" />,
  },
];

export const Toolbar: React.FC<ToolbarProps> = ({
  selectedTool,
  onSelectTool,
  color,
  onColorChange,
  connectorStyle,
  onConnectorStyleChange,
  connectorColor,
  onConnectorColorChange,
  connectorThickness,
  onConnectorThicknessChange,
  onUndo,
  onClearAll,
}) => {
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.target && (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        onUndo();
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        onClearAll();
      } else if (e.key.toLowerCase() === 'v') {
        onSelectTool('pointer');
      } else if (e.key.toLowerCase() === 'r') {
        onSelectTool('rectangle');
      } else if (e.key.toLowerCase() === 'c') {
        onSelectTool('circle');
      } else if (e.key.toLowerCase() === 's') {
        onSelectTool('solid-circle');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSelectTool, onUndo, onClearAll]);

  return (
    <div
      className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none"
      style={{ bottom: 16, top: 'auto', paddingBottom: 0 }}
    >
      <div
        className="flex items-center justify-between bg-white/80 backdrop-blur-md rounded-full px-6 py-2 border border-gray-200 mt-0 mb-0 pointer-events-auto shadow-2xl max-w-3xl min-w-[520px] mx-auto"
        style={{ boxShadow: '0 12px 48px 0 rgba(0,0,0,0.18), 0 4px 16px 0 rgba(0,0,0,0.10)' }}
      >
        {/* Main options group: shape, color, connector */}
        <div className="flex items-center pr-6" aria-label="Shape and connector tools">
          <div className="flex items-center space-x-6">
            {/* Shape tool icons */}
            <div className="flex items-center space-x-4 pr-2" aria-label="Shape tools">
              {tools.map((tool) => (
                <button
                  key={tool.type}
                  onClick={() => onSelectTool(tool.type)}
                  className={`w-10 h-10 flex items-center justify-center rounded-full transition-all duration-150 focus:outline-none text-xl shadow-sm
                    ${selectedTool === tool.type ? 'bg-blue-500 text-white scale-105 shadow-lg' : 'bg-white/60 text-gray-700 hover:bg-blue-100 hover:text-blue-700'}`}
                  title={
                    tool.type === 'pointer' ? 'Pointer (V)' :
                    tool.type === 'rectangle' ? 'Rectangle (R)' :
                    tool.type === 'circle' ? 'Circle (C)' :
                    tool.type === 'solid-circle' ? 'Solid Circle (S)' :
                    tool.label
                  }
                  aria-label={
                    tool.type === 'pointer' ? 'Pointer (V)' :
                    tool.type === 'rectangle' ? 'Rectangle (R)' :
                    tool.type === 'circle' ? 'Circle (C)' :
                    tool.type === 'solid-circle' ? 'Solid Circle (S)' :
                    tool.label
                  }
                  tabIndex={0}
                >
                  <span className="sr-only">{tool.label}</span>
                  {tool.icon}
                </button>
              ))}
            </div>
            {/* Unified color picker */}
            <div className="flex items-center ml-2 mr-1">
              <label htmlFor="unified-color-picker" className="text-xs text-gray-500 mr-1 select-none" title="Color">Color</label>
              <input
                id="unified-color-picker"
                type="color"
                value={color}
                onChange={e => {
                  onColorChange(e.target.value);
                  onConnectorColorChange(e.target.value);
                }}
                className="w-7 h-7 p-0 border-0 bg-transparent cursor-pointer rounded-xl hover:ring-2 hover:ring-blue-200"
                title="r"
                style={{ verticalAlign: 'middle' }}
              />
            </div>
            {/* Connector options */}
            <span className="flex items-center space-x-2 ml-1">
              <LinearScaleIcon fontSize="small" />
              <select
                value={connectorStyle}
                onChange={e => onConnectorStyleChange(e.target.value as 'solid' | 'dashed' | 'dotted')}
                className="rounded-lg px-2 py-0.5 bg-white/80 border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 shadow-sm transition"
                style={{ minWidth: 70 }}
                title="Connector style"
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
              <input
                type="range"
                min={1}
                max={8}
                value={connectorThickness}
                onChange={e => onConnectorThicknessChange(Number(e.target.value))}
                className="ml-1"
                style={{ width: 40 }}
              />
              <span className="w-4 text-[11px] text-center">{connectorThickness}</span>
            </span>
          </div>
        </div>
        {/* Divider between main options and actions */}
        <div className="flex flex-col items-center mx-6 justify-center">
          <div className="h-10 w-1 rounded-full bg-gradient-to-b from-blue-400 via-purple-400 to-pink-400 shadow-md transition-transform duration-200 hover:scale-105 animate-divider-shine" style={{ minHeight: 36 }} />
        </div>
        {/* Undo and Clear All group */}
        <div className="flex items-center pl-6" aria-label="Actions">
          <div className="flex items-center space-x-4 bg-blue-50/80 rounded-full shadow-lg border border-blue-200 px-4 py-1 transition-transform duration-200 hover:scale-105 animate-pill-shine">
            <button
              onClick={onUndo}
              className="w-10 h-10 flex items-center justify-center rounded-full transition-all duration-150 focus:outline-none text-xl bg-white/60 hover:bg-blue-100 hover:text-blue-700 text-gray-700 shadow-sm"
              title="Undo (Ctrl+Z)"
              aria-label="Undo (Ctrl+Z)"
              tabIndex={0}
            >
              <span className="sr-only">Undo</span>
              <UndoIcon fontSize="inherit" />
            </button>
            <button
              onClick={onClearAll}
              className="w-10 h-10 flex items-center justify-center rounded-full transition-all duration-150 focus:outline-none text-xl bg-white/60 hover:bg-red-100 hover:text-red-700 text-red-700 shadow-sm"
              title="Clear All (Ctrl+Shift+X)"
              aria-label="Clear All (Ctrl+Shift+X)"
              tabIndex={0}
            >
              <span className="sr-only">Clear All</span>
              <BackspaceIcon fontSize="inherit" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}; 