import React, { useState, useEffect, useRef, DragEvent } from 'react';
import { useAnnotations } from './hooks/useAnnotations';
import { ImageData } from './types/annotation';
import { Toolbar, ToolType } from './components/Toolbar';
import { AnnotationCanvas } from './components/AnnotationCanvas';
import { exportAnnotatedImage, getExportFilename } from './utils/exportUtils';
import './App.css';

// --- IndexedDB utility for image blobs ---
const DB_NAME = 'woosh-image-db';
const STORE_NAME = 'images';
function openImageDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function saveImageBlob(key: string, blob: Blob) {
  const db = await openImageDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function getImageBlob(key: string): Promise<Blob | null> {
  const db = await openImageDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function deleteImageBlob(key: string) {
  const db = await openImageDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function App() {
  // Restore from localStorage if available
  const savedImageMeta = (() => {
    try {
      const raw = localStorage.getItem('woosh-image');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();
  const savedAnnotations = (() => {
    try {
      const raw = localStorage.getItem('woosh-annotations');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  })();

  const [currentImage, setCurrentImage] = useState<ImageData | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const { annotations, addAnnotation, updateAnnotation, deleteAnnotation, clearAnnotations, undo, redo } = useAnnotations(savedAnnotations);
  const [selectedTool, setSelectedTool] = useState<ToolType>('rectangle');
  const [color, setColor] = useState<string>('#2563eb'); // Tailwind blue-600
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectorStyle, setConnectorStyle] = useState<'solid' | 'dashed' | 'dotted'>('dashed');
  const [connectorThickness, setConnectorThickness] = useState<number>(2);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Remove activeTab state
  const [isDragActive, setIsDragActive] = useState(false);
  const uploadRef = useRef<HTMLDivElement>(null);
  const [exportFormat, setExportFormat] = useState<'png' | 'jpg'>('png');

  // On mount, if savedImageMeta exists, load blob from IndexedDB and create object URL
  useEffect(() => {
    if (savedImageMeta && savedImageMeta.imageKey) {
      setImageLoading(true);
      setImageError(null);
      getImageBlob(savedImageMeta.imageKey).then(blob => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          setCurrentImage({ ...savedImageMeta, url });
        } else {
          setImageError('Failed to load image from storage.');
        }
        setImageLoading(false);
      }).catch(() => {
        setImageError('Failed to load image from storage.');
        setImageLoading(false);
      });
    }
  }, []);

  // Unified image file handler
  const handleImageFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      setImageLoading(true);
      setImageError(null);
      const imageKey = `image-${Date.now()}-${Math.random()}`;
      saveImageBlob(imageKey, file).then(() => {
        const img = new window.Image();
        img.onload = () => {
          const url = URL.createObjectURL(file);
          const imageData: ImageData = {
            id: imageKey,
            fileName: file.name,
            url,
            width: img.width,
            height: img.height,
            annotations: [],
          };
          setCurrentImage(imageData);
          clearAnnotations();
          localStorage.setItem('woosh-image', JSON.stringify({
            id: imageData.id,
            fileName: imageData.fileName,
            imageKey,
            width: imageData.width,
            height: imageData.height
          }));
          localStorage.setItem('woosh-annotations', JSON.stringify([]));
          setImageLoading(false);
        };
        img.onerror = () => {
          setImageError('Failed to load the selected image.');
          setImageLoading(false);
        };
        img.src = URL.createObjectURL(file);
      }).catch(() => {
        setImageError('Failed to save image to storage.');
        setImageLoading(false);
      });
    }
  };

  // Drag-and-drop handlers
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  };
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(true);
  };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  // Paste handler
  useEffect(() => {
    if (!uploadRef.current) return;
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) handleImageFile(file);
          }
        }
      }
    };
    const node = uploadRef.current;
    node.addEventListener('paste', handlePaste);
    return () => node.removeEventListener('paste', handlePaste);
  }, []);

  // Persist image and annotations to localStorage on change
  useEffect(() => {
    if (currentImage) {
      localStorage.setItem('woosh-image', JSON.stringify({
        id: currentImage.id,
        fileName: currentImage.fileName,
        imageKey: currentImage.id,
        width: currentImage.width,
        height: currentImage.height
      }));
    }
  }, [currentImage]);
  useEffect(() => {
    localStorage.setItem('woosh-annotations', JSON.stringify(annotations));
  }, [annotations]);

  // Pass selection state to canvas
  const handleSelectAnnotation = (id: string | null) => setSelectedId(id);

  // Handle export
  const handleExport = async () => {
    if (!svgRef.current || !currentImage) {
      alert('Please load an image first');
      return;
    }

    try {
      const filename = getExportFilename(currentImage.fileName, exportFormat);
      await exportAnnotatedImage(svgRef.current, {
        format: exportFormat,
        quality: 0.9,
        filename
      }, containerRef.current || undefined);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  // Handle clear image
  const handleClearImage = () => {
    if (currentImage) {
      // Revoke the object URL to free memory
      URL.revokeObjectURL(currentImage.url);
      // Clear the image from IndexedDB
      deleteImageBlob(currentImage.id).catch(console.error);
    }
    // Clear state
    setCurrentImage(null);
    clearAnnotations();
    // Clear localStorage
    localStorage.removeItem('woosh-image');
    localStorage.removeItem('woosh-annotations');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-between items-center" style={{ minHeight: '100vh' }}>
      <main className="flex-1 w-full flex flex-col items-center justify-center">
        <header className="mb-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-2 tracking-tight">
            VizAudit
          </h1>
          <p className="text-sm text-gray-500 font-medium mb-8">
            Upload an image to audit visually. Draw, label, and export your findings!
          </p>
        </header>
        {currentImage && (
          <div className="w-full flex flex-col items-center">
            <div className="border border-gray-200 rounded-3xl p-8 w-full flex justify-center bg-white shadow-2xl max-w-5xl">
              <AnnotationCanvas
                imageUrl={currentImage.url}
                imageWidth={currentImage.width}
                imageHeight={currentImage.height}
                tool={selectedTool}
                color={color}
                annotations={annotations}
                onAddAnnotation={addAnnotation}
                onUpdateAnnotation={updateAnnotation}
                selectedId={selectedId}
                onSelectAnnotation={handleSelectAnnotation}
                expandCanvas={true}
                connectorColor={color}
                connectorStyle={connectorStyle}
                connectorThickness={connectorThickness}
                svgRef={svgRef}
                containerRef={containerRef}
              />
            </div>
          </div>
        )}
        {!currentImage && (
          <div
            ref={uploadRef}
            tabIndex={0}
            className={`border border-gray-200 rounded-3xl p-8 bg-white shadow-2xl w-full max-w-xl flex flex-col items-center justify-center mt-8 transition-all duration-200 outline-none ${isDragActive ? 'ring-4 ring-blue-300 border-blue-400 bg-blue-50' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDragEnd={handleDragLeave}
          >
            <label className="flex flex-col items-center w-full cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  if (e.target.files && e.target.files[0]) handleImageFile(e.target.files[0]);
                }}
              />
              <button
                type="button"
                className="px-8 py-3 bg-blue-600 text-white rounded-full shadow hover:bg-blue-700 transition text-lg font-semibold mb-2"
                onClick={() => (document.querySelector('input[type=file]') as HTMLInputElement)?.click()}
              >
                Click to Upload or Drop/Paste Image
              </button>
              <span className="text-gray-400 text-sm mt-2">or drag & drop / paste an image here</span>
            </label>
            {isDragActive && (
              <div className="absolute inset-0 bg-blue-100/60 rounded-3xl border-4 border-blue-400 flex items-center justify-center pointer-events-none z-10">
                <span className="text-blue-700 text-lg font-semibold">Drop image to upload</span>
              </div>
            )}
          </div>
        )}
        {/* Existing loading and error UI */}
        {imageLoading && (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-12 h-12 border-4 border-blue-300 border-t-blue-600 rounded-full animate-spin mb-2"></div>
            <div className="text-blue-700 font-medium">Loading image...</div>
          </div>
        )}
        {imageError && (
          <div className="flex flex-col items-center justify-center py-4">
            <div className="text-red-600 font-semibold">{imageError}</div>
          </div>
        )}
      </main>
      {/* Fixed bottom toolbar, only when image is loaded */}
      {currentImage && (
        <div className="w-full max-w-5xl px-4 pb-4">
          <div className="flex justify-center items-center gap-2 mb-4">
            <label htmlFor="exportFormat" className="text-gray-700 font-medium">Export Format:</label>
            <select
              id="exportFormat"
              className="p-2 border border-gray-300 rounded-md text-sm"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as 'png' | 'jpg')}
            >
              <option value="png">PNG</option>
              <option value="jpg">JPG</option>
            </select>
          </div>
          <Toolbar
            selectedTool={selectedTool}
            onSelectTool={setSelectedTool}
            color={color}
            onColorChange={setColor}
            connectorStyle={connectorStyle}
            onConnectorStyleChange={setConnectorStyle}
            connectorColor={color}
            onConnectorColorChange={setColor}
            connectorThickness={connectorThickness}
            onConnectorThicknessChange={setConnectorThickness}
            onUndo={undo}
            onRedo={redo}
            onClearAll={clearAnnotations}
            onExport={handleExport}
            onClearImage={handleClearImage}
            className=""
          />
        </div>
      )}
      <footer className="w-full py-4 text-center text-gray-400 text-xs border-t border-gray-100 mt-8">
        Created by Sukha
      </footer>
    </div>
  );
}

export default App; 