import React, { useState, useEffect } from 'react';
import { useAnnotations } from './hooks/useAnnotations';
import { ImageData } from './types/annotation';
import { Toolbar, ToolType } from './components/Toolbar';
import { AnnotationCanvas } from './components/AnnotationCanvas';
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
  const { annotations, addAnnotation, updateAnnotation, deleteAnnotation, clearAnnotations, undo } = useAnnotations(savedAnnotations);
  const [selectedTool, setSelectedTool] = useState<ToolType>('rectangle');
  const [color, setColor] = useState<string>('#2563eb'); // Tailwind blue-600
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectorStyle, setConnectorStyle] = useState<'solid' | 'dashed' | 'dotted'>('dashed');
  const [connectorThickness, setConnectorThickness] = useState<number>(2);
  // Remove activeTab state

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

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
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
          // Save new image meta to localStorage, clear annotations
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

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: 'Inter, Segoe UI, Helvetica Neue, Arial, sans-serif' }}>
      {/* Floating Toolbar at bottom, only if image is loaded */}
      {currentImage && (
        <Toolbar
          selectedTool={selectedTool}
          onSelectTool={setSelectedTool}
          color={color}
          onColorChange={(newColor) => {
            setColor(newColor);
          }}
          connectorStyle={connectorStyle}
          onConnectorStyleChange={setConnectorStyle}
          connectorColor={color}
          onConnectorColorChange={setColor}
          connectorThickness={connectorThickness}
          onConnectorThicknessChange={setConnectorThickness}
          onUndo={undo}
          onClearAll={clearAnnotations}
        />
      )}
      <div className="main-content mx-auto px-4 py-8 flex flex-col items-center">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Image Annotation Software
          </h1>
          <p className="text-gray-600">
            Effortlessly annotate images with clear, structured explanations
          </p>
        </header>
        <div className="w-full max-w-4xl flex flex-col items-center space-y-6 mt-24">
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
          <div className="w-full flex flex-col items-center">
            <label className="block text-lg font-medium text-gray-700 mb-2">
              Upload Image
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
          {currentImage ? (
            <div className="border border-gray-300 rounded-lg p-4 mt-2 w-full flex justify-center bg-white shadow-sm">
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
              />
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg p-12 text-center mt-2 bg-white shadow-sm w-full">
              <p className="text-gray-500">
                Upload an image to get started with annotations
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App; 