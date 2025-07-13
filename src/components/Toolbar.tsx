import React, { useEffect, useState } from 'react';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import Crop75Icon from '@mui/icons-material/Crop75';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import LinearScaleIcon from '@mui/icons-material/LinearScale';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import BackspaceIcon from '@mui/icons-material/Backspace';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ImageIcon from '@mui/icons-material/Image';
import PaletteIcon from '@mui/icons-material/Palette';
import SettingsIcon from '@mui/icons-material/Settings';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ClearIcon from '@mui/icons-material/Clear';
import EditIcon from '@mui/icons-material/Edit';

export type ToolType = 'pointer' | 'rectangle' | 'circle' | 'solid-circle' | 'pencil';

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
  onRedo: () => void;
  onClearAll: () => void;
  onExport: () => void;
  onClearImage: () => void;
  exportFormat: 'png' | 'jpg';
  onExportFormatChange: (format: 'png' | 'jpg') => void;
  className?: string;
}

const drawingTools: { type: ToolType; label: string; icon: React.ReactNode; shortcut: string; description: string }[] = [
  {
    type: 'pointer',
    label: 'Select & Move',
    icon: <NorthEastIcon fontSize="medium" />,
    shortcut: 'V',
    description: 'Select and move shapes and labels'
  },
  {
    type: 'rectangle',
    label: 'Rectangle',
    icon: <Crop75Icon fontSize="medium" />,
    shortcut: 'R',
    description: 'Draw rectangular annotations'
  },
  {
    type: 'circle',
    label: 'Circle',
    icon: <RadioButtonUncheckedIcon fontSize="medium" />,
    shortcut: 'C',
    description: 'Draw circular annotations'
  },
  {
    type: 'solid-circle',
    label: 'Dot',
    icon: <FiberManualRecordIcon fontSize="medium" />,
    shortcut: 'S',
    description: 'Draw solid circular dots'
  },
  {
    type: 'pencil',
    label: 'Pencil',
    icon: <EditIcon fontSize="medium" />,
    shortcut: 'P',
    description: 'Freehand pencil drawing'
  },
];

const actionTools = [
  {
    action: 'undo',
    label: 'Undo',
    icon: <UndoIcon fontSize="medium" />,
    shortcut: 'Ctrl+Z',
    description: 'Undo last action'
  },
  {
    action: 'redo',
    label: 'Redo',
    icon: <RedoIcon fontSize="medium" />,
    shortcut: 'Ctrl+Y',
    description: 'Redo last undone action'
  },
  {
    action: 'clear',
    label: 'Clear All',
    icon: <DeleteSweepIcon fontSize="medium" />,
    shortcut: 'Ctrl+Shift+X',
    description: 'Clear all annotations'
  },
  {
    action: 'export',
    label: 'Export',
    icon: <FileDownloadIcon fontSize="medium" />,
    shortcut: 'Ctrl+E',
    description: 'Export annotated image'
  },
  {
    action: 'clearImage',
    label: 'Clear Image',
    icon: <ClearIcon fontSize="medium" />,
    shortcut: 'Ctrl+I',
    description: 'Clear current image'
  },
];

// Common button class for toolbar buttons
const toolbarButtonClass = `group relative w-14 h-14 flex items-center justify-center rounded-full bg-transparent text-gray-700 hover:bg-gray-100 hover:text-blue-600 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 px-1`;

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
  onRedo,
  onClearAll,
  onExport,
  onClearImage,
  exportFormat,
  onExportFormatChange,
  className,
}) => {
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showPalette, setShowPalette] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        onUndo();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        onRedo();
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        onClearAll();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        onExport();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        onClearImage();
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
  }, [onSelectTool, onUndo, onClearAll, onExport, onClearImage]);

  const handleActionClick = (action: string) => {
    switch (action) {
      case 'undo': onUndo(); break;
      case 'redo': onRedo(); break;
      case 'clear': onClearAll(); break;
      case 'export':
        console.log('[DEBUG] Export button clicked. exportFormat:', exportFormat);
        onExport();
        break;
      case 'clearImage':
        console.log('[DEBUG] Clear Image button clicked');
        onClearImage();
        break;
    }
  };

  // Remove export and clearImage from actionTools for the main pill
  const mainActionTools = actionTools.filter(tool => tool.action !== 'export' && tool.action !== 'clearImage');
  const exportTools = actionTools.filter(tool => tool.action === 'export' || tool.action === 'clearImage');

  return (
    <div className={"woosh-toolbar-bottom-override flex flex-row items-end gap-8 pointer-events-none " + (className || "")}> {/* Allow extra className if needed */}
      {/* Main Toolbar Pill */}
      <div
        className="flex items-center bg-white rounded-full px-14 py-2 pointer-events-auto shadow-xl max-w-4xl min-w-[480px] gap-2"
        style={{
          boxShadow: '0 4px 24px 0 rgba(60,60,100,0.10), 0 1.5px 6px 0 rgba(0,0,0,0.06)',
          background: '#fff',
          border: 'none',
          outline: 'none',
        }}
      >
        {/* Drawing Tools */}
        <div className="flex items-center">
          {drawingTools.map((tool, idx) => (
            <button
              key={tool.type}
              onClick={() => onSelectTool(tool.type)}
              className={[
                toolbarButtonClass,
                idx === 0 ? 'ml-4' : '',
                idx === drawingTools.length - 1 ? 'mr-4' : '',
                selectedTool === tool.type ? 'text-white scale-110 shadow-md' : '',
              ].join(' ')}
              style={selectedTool === tool.type ? { background: connectorColor } : {}}
              title={`${tool.label} (${tool.shortcut}) - ${tool.description}`}
              aria-label={`${tool.label} (${tool.shortcut})`}
              tabIndex={0}
            >
              <span className="sr-only">{tool.label}</span>
              <div className="transition-transform duration-200 group-hover:scale-110">
                {tool.icon}
              </div>
            </button>
          ))}
        </div>
        {/* Main group separator: Drawing → Action */}
        <div className="toolbar-group-separator" />
        {/* Action Tools (undo, redo, clear all) */}
        <div className="flex items-center">
          {mainActionTools.map((tool, idx) => (
            <button
              key={tool.action}
              onClick={() => handleActionClick(tool.action)}
              className={[
                toolbarButtonClass,
                idx === 0 ? 'ml-4' : '',
                idx === mainActionTools.length - 1 ? 'mr-4' : '',
              ].join(' ')}
              title={`${tool.label} (${tool.shortcut}) - ${tool.description}`}
              aria-label={`${tool.label} (${tool.shortcut})`}
              tabIndex={0}
            >
              <span className="sr-only">{tool.label}</span>
              <div className="transition-transform duration-200 group-hover:scale-110">
                {tool.icon}
              </div>
            </button>
          ))}
        </div>
        {/* Main group separator: Action → Settings */}
        <div className="toolbar-group-separator" />
        {/* Settings Tools */}
        <div className="flex items-center">
          <button
            onClick={() => setShowPalette(!showPalette)}
            className={toolbarButtonClass + " ml-4"}
            title="Show color and connector options"
            aria-label="Show color and connector options"
          >
            <PaletteIcon fontSize="medium" />
          </button>
          <button
            onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
            className={toolbarButtonClass + " mr-4"}
            title="Show advanced connector settings"
            aria-label="Show advanced connector settings"
          >
            <SettingsIcon fontSize="medium" />
          </button>
        </div>
        {/* Color/connector palette dropdown */}
        {showPalette && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 min-w-[260px] max-w-[320px] rounded-2xl shadow-2xl z-50 px-6 py-5"
            style={{ background: '#232324', color: '#fff', border: 'none', boxShadow: '0 8px 32px 0 rgba(0,0,0,0.25)' }}>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4 mb-2">
                <span className="text-white text-base flex items-center min-w-[80px]"><PaletteIcon className="mr-2" fontSize="small" />Color</span>
                <input
                  id="unified-color-picker"
                  type="color"
                  value={color}
                  onChange={e => onColorChange(e.target.value)}
                  className="w-9 h-9 rounded-full border-2 border-gray-700 cursor-pointer bg-transparent"
                  title="Choose color for shapes and connectors"
                  style={{ borderColor: '#444' }}
                />
                <span className="w-7 h-7 rounded-full border-2 border-white shadow-sm ml-2" style={{ backgroundColor: color }}></span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-white text-base flex items-center min-w-[80px]"><LinearScaleIcon className="mr-2" fontSize="small" />Connector</span>
                <select
                  value={connectorStyle}
                  onChange={e => onConnectorStyleChange(e.target.value as any)}
                  className="rounded-md bg-[#232324] border border-gray-700 text-white text-base px-3 py-2 focus:outline-none min-w-[100px]"
                  style={{ minWidth: 100, color: '#fff', fontSize: '1rem', padding: '0.5rem 1rem' }}
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
                <input
                  type="color"
                  value={connectorColor}
                  onChange={e => onConnectorColorChange(e.target.value)}
                  className="w-9 h-9 rounded-full border-2 border-gray-700 cursor-pointer bg-transparent ml-2"
                  title="Connector color"
                  style={{ borderColor: '#444' }}
                />
              </div>
            </div>
          </div>
        )}
        {/* Advanced connector settings dropdown */}
        {showAdvancedOptions && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 min-w-[220px] max-w-[260px] rounded-2xl shadow-2xl z-50"
            style={{ background: '#232324', color: '#fff', border: 'none', boxShadow: '0 8px 32px 0 rgba(0,0,0,0.25)' }}>
            <div className="flex flex-col gap-4 p-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Connector Thickness</label>
                <input
                  type="range"
                  min={1}
                  max={8}
                  value={connectorThickness}
                  onChange={e => onConnectorThicknessChange(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
                <div className="text-xs text-gray-400 mt-1">{connectorThickness}px</div>
              </div>
            </div>
          </div>
        )}
        {/* Export and Clear Image section */}
        <div className="flex items-center gap-2 ml-4">
          {/* Export format dropdown */}
          <select
            className="p-1 border border-gray-300 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={exportFormat}
            onChange={e => onExportFormatChange(e.target.value as 'png' | 'jpg')}
            style={{ height: 32 }}
            aria-label="Export format"
          >
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
          </select>
          {/* Export button */}
          <button
            type="button"
            className={toolbarButtonClass}
            title="Export annotated image"
            onClick={() => handleActionClick('export')}
            aria-label="Export"
          >
            <FileDownloadIcon fontSize="medium" />
          </button>
          {/* Clear Image button */}
          <button
            type="button"
            className={toolbarButtonClass}
            title="Clear current image"
            onClick={() => handleActionClick('clearImage')}
            aria-label="Clear Image"
          >
            <ClearIcon fontSize="medium" />
          </button>
        </div>
      </div>
    </div>
  );
}; 