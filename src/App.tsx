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
import BoardCanvas from './components/BoardCanvas';
import { ProjectType, Project } from './types/annotation';
import BoardToolbar from './components/BoardToolbar';
import { BoardImageV2, BoardAnnotationType } from './types/annotation';

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
  const [currentBoardImages, setCurrentBoardImages] = useState<BoardImageV2[]>([]);
  const [isBoardProject, setIsBoardProject] = useState(false);
  const [boardZoom, setBoardZoom] = useState(1);
  const [boardPan, setBoardPan] = useState({ x: 0, y: 0 });
  const [selectedBoardImageId, setSelectedBoardImageId] = useState<string | null>(null);

  // Robust board annotation system state
  const [boardImages, setBoardImages] = useState<BoardImageV2[]>([]);
  const [boardTool, setBoardTool] = useState<BoardAnnotationType>('pointer');
  const [boardColor, setBoardColor] = useState<string>('#1976d2');
  // Undo/redo stacks for board annotations
  const [boardHistory, setBoardHistory] = useState<BoardImageV2[][]>([]);
  const [boardFuture, setBoardFuture] = useState<BoardImageV2[][]>([]);

  // Board annotation handlers
  const handleBoardUpdateImage = (id: string, updates: Partial<BoardImageV2>) => {
    setBoardImages(imgs => imgs.map(img => img.id === id ? { ...img, ...updates } : img));
    setBoardHistory(hist => [...hist, boardImages]);
    setBoardFuture([]);
  };
  const handleBoardAnnotationChange = (id: string, annotations: BoardImageV2['annotations']) => {
    setBoardImages(imgs => imgs.map(img => img.id === id ? { ...img, annotations } : img));
    setBoardHistory(hist => [...hist, boardImages]);
    setBoardFuture([]);
  };
  const handleBoardUndo = () => {
    setBoardHistory(hist => {
      if (hist.length === 0) return hist;
      setBoardFuture(fut => [boardImages, ...fut]);
      setBoardImages(hist[hist.length - 1]);
      return hist.slice(0, -1);
    });
  };
  const handleBoardRedo = () => {
    setBoardFuture(fut => {
      if (fut.length === 0) return fut;
      setBoardHistory(hist => [...hist, boardImages]);
      setBoardImages(fut[0]);
      return fut.slice(1);
    });
  };
  const handleBoardExport = () => {
    // TODO: Implement export logic for board (e.g., export as image or JSON)
    alert('Export not implemented yet!');
  };

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

  // Auto-save board project when images change
  React.useEffect(() => {
    if (isBoardProject && currentBoardImages.length > 0) {
      const boardId = currentProjectId || `board-${Date.now()}-${Math.random()}`;
      const boardTitle = title || `Board Project ${new Date().toLocaleDateString()}`;
      saveProject(
        boardId,
        boardTitle,
        '', // no fileName
        '', // no imageKey
        0, // no width
        0, // no height
        [], // no single-image annotations
        boardTitle,
        '', // no thumbnail
        { type: 'board', boardImages: currentBoardImages }
      );
      setCurrentProjectId(boardId);
      setTitle(boardTitle);
    }
  }, [isBoardProject, currentBoardImages]);

  // Unified image file handler (updated for board projects)
  const handleImageFile = async (fileOrFiles: File | FileList) => {
    const files = fileOrFiles instanceof FileList ? fileOrFiles : [fileOrFiles];
    if (files.length > 1) {
      // Board project: multiple images (new robust model)
      const boardImages: BoardImageV2[] = [];
      let gridCols = Math.ceil(Math.sqrt(files.length));
      const imgSize = 320;
      let idx = 0;
      for (const file of Array.from(files)) {
        const boardImageId = `img-${Date.now()}-${idx}`;
        await saveImageBlob(boardImageId, file);
        const url = URL.createObjectURL(file);
        boardImages.push({
          id: boardImageId,
          url,
          fileName: file.name,
          x: (idx % gridCols) * (imgSize + 32) + 80,
          y: Math.floor(idx / gridCols) * (imgSize + 32) + 80,
          width: imgSize,
          height: imgSize,
          annotations: [], // BoardAnnotation[]
        });
        idx++;
      }
      setBoardImages(boardImages);
      setSelectedBoardImageId(boardImages[0]?.id || null);
      setShowGallery(false);
      return;
    }
    // Single image (existing flow)
    const file = files[0];
    if (file && file.type.startsWith('image/')) {
      setImageLoading(true);
      setImageError(null);
      try {
        const imageKey = `image-${Date.now()}-${Math.random()}`;
        await saveImageBlob(imageKey, file);
        const img = new window.Image();
        img.onload = async () => {
          const imageData: ImageData = {
            id: imageKey,
            fileName: file.name,
            width: img.width,
            height: img.height,
            annotations: [],
          };
          const thumbnailUrl = await generateThumbnail(file);
          const projectId = `project-${Date.now()}-${Math.random()}`;
          await saveProject(
            projectId,
            '',
            file.name,
            imageKey,
            img.width,
            img.height,
            [],
            '',
            thumbnailUrl
          );
          const url = URL.createObjectURL(file);
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
  const handleSelectProject = async (project: any) => {
    setImageLoading(true);
    setImageError(null);
    try {
      // Check for board project (type or boardImages)
      if (project.type === 'board' || project.boardImages) {
        // Board project: rehydrate image URLs (new robust model)
        const boardImages: BoardImageV2[] = await Promise.all((project.boardImages || []).map(async (img: any) => {
          let blob: Blob | null = null;
          if (img.id) blob = await getImageBlob(img.id);
          if (!blob && img.fileName) blob = await getImageBlob(img.fileName);
          let url = '';
          if (blob !== null) url = URL.createObjectURL(blob);
          return { ...img, url };
        }));
        setBoardImages(boardImages);
        setSelectedBoardImageId(boardImages[0]?.id || null);
        setShowGallery(false);
        return;
      }
      // Single-image project (default)
      const blob = await getImageBlob(project.imageKey);
      if (!blob) {
        throw new Error('Image not found');
      }
      const url = URL.createObjectURL(blob);
      const imageData: RuntimeImageData = {
        id: project.imageKey,
        fileName: project.fileName,
        width: project.width,
        height: project.height,
        annotations: project.annotations,
        url,
      };
      setCurrentImage(imageData);
      setCurrentProjectId(project.id);
      setTitle(project.title);
      clearAnnotations();
      project.annotations.forEach(ann => addAnnotation(ann));
      setShowGallery(false);
      setIsBoardProject(false);
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
    <Box sx={{ minHeight: '100vh', bgcolor: 'gray.50', display: 'flex', flexDirection: 'column' }}>
      {/* Remove logo and app name from here; handled in Gallery.tsx header */}
      <Box sx={{ flex: 1, width: '100%' }}>
        {showGallery ? (
          <Gallery
            projects={projects}
            onSelectProject={handleSelectProject}
            onDeleteProject={handleDeleteProject}
            onUploadNew={handleImageFile}
            onExportProject={handleExportProject}
          />
        ) : boardImages.length > 0 ? (
          <>
            {!showGallery && (
              <Box sx={{ position: 'absolute', top: 16, left: 16, zIndex: 100 }}>
                <IconButton color="primary" onClick={() => setShowGallery(true)}>
                  <ArrowBackIcon />
                </IconButton>
              </Box>
            )}
            <BoardCanvas
              images={boardImages}
              onUpdateImage={handleBoardUpdateImage}
              onAnnotationChange={handleBoardAnnotationChange}
              selectedImageId={selectedBoardImageId}
              onSelectImage={setSelectedBoardImageId}
              tool={boardTool}
              color={boardColor}
            />
            <BoardToolbar
              selectedTool={boardTool}
              onSelectTool={setBoardTool}
              color={boardColor}
              onColorChange={setBoardColor}
              onUndo={handleBoardUndo}
              onRedo={handleBoardRedo}
              onExport={handleBoardExport}
            />
          </>
        ) : null}
      </Box>
      {/* Fixed bottom toolbar, only when image is loaded */}
      {(currentImage || isBoardProject) && (
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
      {/* Modern centered footer with logo and branding */}
      <footer style={{ width: '100%', padding: '24px 0 12px 0', textAlign: 'center', color: '#888', fontSize: 14, borderTop: '1px solid #eee', marginTop: 32, background: 'transparent' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <img src="/VizAudit Logo.png" alt="VizAudit Logo" style={{ width: 36, height: 36, borderRadius: 8, marginBottom: 4 }} />
          <span>Created with <span style={{ color: '#e25555', fontWeight: 700 }}>&hearts;</span> by Sukha @ VizAudit</span>
        </div>
      </footer>
    </Box>
  );
}

export default App; 