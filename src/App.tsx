import React, { useState, useEffect, useRef, DragEvent } from 'react';
import { useAnnotations } from './hooks/useAnnotations';
import { useGallery } from './hooks/useGallery';
import { ImageData, SavedProject } from './types/annotation';
import { Toolbar, ToolType } from './components/Toolbar';
import { AnnotationCanvas } from './components/AnnotationCanvas';
import { Gallery } from './components/Gallery';
import { exportAnnotatedImage, getExportFilename } from './utils/exportUtils';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Box, Typography, IconButton, Tooltip, Divider } from '@mui/material';

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

// Add a local type for runtime use
interface RuntimeImageData extends ImageData {
  url: string;
}

function App() {
  // Gallery state
  const { 
    projects, 
    loading: galleryLoading, 
    saveProject, 
    loadProject, 
    deleteProject, 
    updateProjectMetadata, 
    generateThumbnail 
  } = useGallery();

  // App state
  // Use RuntimeImageData for currentImage state
  const [currentImage, setCurrentImage] = useState<RuntimeImageData | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [showGallery, setShowGallery] = useState(true);
  const { annotations, addAnnotation, updateAnnotation, deleteAnnotation, clearAnnotations, undo, redo } = useAnnotations([]);
  const [selectedTool, setSelectedTool] = useState<ToolType>('rectangle');
  const [color, setColor] = useState<string>('#2563eb'); // Tailwind blue-600
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectorStyle, setConnectorStyle] = useState<'solid' | 'dashed' | 'dotted'>('dashed');
  const [connectorThickness, setConnectorThickness] = useState<number>(2);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const uploadRef = useRef<HTMLDivElement>(null);
  const [exportFormat, setExportFormat] = useState<'png' | 'jpg'>('png');
  const [title, setTitle] = useState<string>('');

  // Auto-save current project when annotations or title change
  useEffect(() => {
    if (currentProjectId && currentImage && !imageLoading) {
      const autoSave = async () => {
        try {
          // Find the current project in the gallery to get its thumbnailUrl
          const currentProject = projects.find(p => p.id === currentProjectId);
          await saveProject(
            currentProjectId,
            title, // Use title as the project name
            currentImage.fileName || 'image.jpg',
            currentImage.id,
            currentImage.width,
            currentImage.height,
            annotations,
            title,
            currentProject?.thumbnailUrl // Preserve the thumbnail if it exists
          );
        } catch (error) {
          console.error('Auto-save failed:', error);
        }
      };
      // Debounce auto-save
      const timeoutId = setTimeout(autoSave, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [currentProjectId, currentImage, annotations, title, saveProject, imageLoading, projects]);

  // Unified image file handler
  const handleImageFile = async (file: File) => {
    if (file && file.type.startsWith('image/')) {
      setImageLoading(true);
      setImageError(null);
      
      try {
        const imageKey = `image-${Date.now()}-${Math.random()}`;
        await saveImageBlob(imageKey, file);
        
        const img = new window.Image();
        img.onload = async () => {
          // Only store serializable data in project
          const imageData: ImageData = {
            id: imageKey,
            fileName: file.name,
            width: img.width,
            height: img.height,
            annotations: [],
          };
          
          // Generate thumbnail
          const thumbnailUrl = await generateThumbnail(file);
          
          // Create new project
          const projectId = `project-${Date.now()}-${Math.random()}`;
          await saveProject(
            projectId,
            '', // Start with empty name, will be set by title
            file.name,
            imageKey,
            img.width,
            img.height,
            [],
            '',
            thumbnailUrl
          );
          
          // Reconstruct URL for use in app state only
          const url = URL.createObjectURL(file);
          // Set a default title
          const defaultTitle = `Untitled Project ${new Date().toLocaleDateString()}`;
          setCurrentImage({ ...imageData, url });
          setCurrentProjectId(projectId);
          setTitle(defaultTitle);
          clearAnnotations();
          setShowGallery(false);
          setImageLoading(false);
        };
        
        img.onerror = () => {
          setImageError('Failed to load the selected image.');
          setImageLoading(false);
        };
        
        img.src = URL.createObjectURL(file);
      } catch (error) {
        setImageError('Failed to save image to storage.');
        setImageLoading(false);
      }
    }
  };

  // Global paste handler for the entire app
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Only allow pasting if no image is loaded
      if (currentImage) return;
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
    
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [currentImage]);

  // Gallery handlers
  const handleSelectProject = async (project: SavedProject) => {
    setImageLoading(true);
    setImageError(null);
    
    try {
      // Load image blob
      const blob = await getImageBlob(project.imageKey);
      if (!blob) {
        throw new Error('Image not found');
      }
      
      // Reconstruct URL for use in app state only
      const url = URL.createObjectURL(blob);
      const imageData: RuntimeImageData = {
        id: project.imageKey,
        fileName: project.fileName,
        width: project.width,
        height: project.height,
        annotations: project.annotations,
        url, // Only for runtime use
      };
      
      setCurrentImage(imageData);
      setCurrentProjectId(project.id);
      setTitle(project.title);
      // Load annotations into the hook
      clearAnnotations();
      project.annotations.forEach(ann => addAnnotation(ann));
      setShowGallery(false);
      setImageLoading(false);
    } catch (error) {
      setImageError('Failed to load project.');
      setImageLoading(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      await deleteProject(projectId);
      // If this was the current project, clear it
      if (currentProjectId === projectId) {
        setCurrentImage(null);
        setCurrentProjectId(null);
        setTitle('');
        clearAnnotations();
        setShowGallery(true);
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const handleExportProject = async (project: SavedProject) => {
    try {
      // Load the project temporarily for export
      const blob = await getImageBlob(project.imageKey);
      if (!blob) {
        throw new Error('Image not found');
      }
      
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        // Create a temporary canvas with the project data
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        canvas.width = project.width;
        canvas.height = project.height;
        
        // Draw image
        ctx.drawImage(img, 0, 0);
        
        // TODO: Draw annotations on the canvas
        // This would require implementing the annotation rendering logic
        
        // Export
        const filename = getExportFilename(project.fileName, exportFormat);
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL(`image/${exportFormat}`, 0.9);
        link.click();
        
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch (error) {
      console.error('Failed to export project:', error);
    }
  };

  const handleBackToGallery = () => {
    setCurrentImage(null);
    setCurrentProjectId(null);
    setTitle('');
    clearAnnotations();
    setShowGallery(true);
  };

  // Pass selection state to canvas
  const handleSelectAnnotation = (id: string | null) => setSelectedId(id);
  // Update title everywhere from the central source of truth
  const handleUpdateTitle = async (newTitle: string) => {
    if (!currentProjectId) return;
    setTitle(newTitle);
    await updateProjectMetadata(currentProjectId, { name: newTitle, title: newTitle });
  };

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

  // Handle clear image (now goes back to gallery)
  const handleClearImage = () => {
    handleBackToGallery();
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'gray.50' }}>
      {showGallery ? (
        <Gallery
          projects={projects}
          onSelectProject={handleSelectProject}
          onDeleteProject={handleDeleteProject}
          onUploadNew={handleImageFile}
          onExportProject={handleExportProject}
          updateProjectMetadata={updateProjectMetadata}
        />
      ) : (
        <Box sx={{ width: '100%', maxWidth: '100vw', mx: 'auto', pt: 2 }}>
          {/* Remove header row and spacers, move back button into AnnotationCanvas */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {currentImage && (
              <AnnotationCanvas
                imageUrl={currentImage.url}
                imageWidth={currentImage.width}
                imageHeight={currentImage.height}
                tool={selectedTool}
                color={color}
                annotations={annotations}
                onAddAnnotation={addAnnotation}
                onUpdateAnnotation={updateAnnotation}
                onDeleteAnnotation={deleteAnnotation}
                selectedId={selectedId}
                onSelectAnnotation={handleSelectAnnotation}
                expandCanvas={true}
                connectorColor={color}
                connectorStyle={connectorStyle}
                connectorThickness={connectorThickness}
                showLabelNumbers={true}
                title={title}
                onUpdateTitle={handleUpdateTitle}
                svgRef={svgRef}
                containerRef={containerRef}
                autoFocusTitle={title.startsWith('Untitled Project') || !title}
                onBack={handleBackToGallery} // Pass back button handler
              />
            )}
          </Box>
        </Box>
      )}
      
      {/* Fixed bottom toolbar, only when image is loaded */}
      {currentImage && (
        <Box sx={{ width: '100%', maxWidth: '100vw', px: 4, pb: 4, position: 'fixed', bottom: 0, left: 0, zIndex: 10 }}>
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
            onClearImage={handleBackToGallery}
            exportFormat={exportFormat}
            onExportFormatChange={setExportFormat}
            className=""
          />
        </Box>
      )}
      
      <footer className="w-full py-4 text-center text-gray-400 text-xs border-t border-gray-100 mt-8">
        Created by Sukha
      </footer>
    </Box>
  );
}

export default App; 