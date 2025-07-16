import { useState, useEffect, useCallback } from 'react';
import { SavedProject, Annotation } from '../types/annotation';

// IndexedDB setup for projects
const PROJECT_DB_NAME = 'woosh-projects-db';
const PROJECT_STORE_NAME = 'projects';
const PROJECT_META_STORE_NAME = 'project-metadata';

function openProjectDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(PROJECT_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Store for project data
      if (!db.objectStoreNames.contains(PROJECT_STORE_NAME)) {
        db.createObjectStore(PROJECT_STORE_NAME, { keyPath: 'id' });
      }
      // Store for project metadata (for faster listing)
      if (!db.objectStoreNames.contains(PROJECT_META_STORE_NAME)) {
        db.createObjectStore(PROJECT_META_STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const useGallery = () => {
  const [projects, setProjects] = useState<SavedProject[]>([]); // Now includes type and boardImages for board projects
  const [loading, setLoading] = useState(true);

  // Load all projects from IndexedDB
  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      const db = await openProjectDB();
      const tx = db.transaction(PROJECT_META_STORE_NAME, 'readonly');
      const store = tx.objectStore(PROJECT_META_STORE_NAME);
      const req = store.getAll();
      
      req.onsuccess = () => {
        const projectList = req.result || [];
        // Sort by updatedAt (newest first)
        projectList.sort((a, b) => b.updatedAt - a.updatedAt);
        setProjects(projectList);
        setLoading(false);
      };
      
      req.onerror = () => {
        console.error('Failed to load projects');
        setLoading(false);
      };
    } catch (error) {
      console.error('Error loading projects:', error);
      setLoading(false);
    }
  }, []);

  // Save a project
  const saveProject = useCallback(async (
    projectId: string,
    name: string,
    fileName: string,
    imageKey: string,
    width: number,
    height: number,
    annotations: Annotation[],
    title: string,
    thumbnailUrl?: string,
    extra?: Partial<Pick<SavedProject, 'type' | 'boardImages'>>
  ) => {
    try {
      const db = await openProjectDB();
      const now = Date.now();
      
      const project: SavedProject = {
        id: projectId,
        name: name || '',
        fileName: fileName || '',
        imageKey: imageKey || '',
        width: width || 0,
        height: height || 0,
        annotations: Array.isArray(annotations) ? annotations : [],
        title: title || '',
        createdAt: now,
        updatedAt: now,
        thumbnailUrl: thumbnailUrl || '',
        ...(extra || {}),
      };

      // Remove any undefined properties (defensive)
      Object.keys(project).forEach(key => {
        if (project[key as keyof SavedProject] === undefined) {
          delete project[key as keyof SavedProject];
        }
      });

      // Debug log before saving
      console.log('Saving to IndexedDB:', JSON.stringify(project, null, 2));
      // Save full project data
      const tx1 = db.transaction(PROJECT_STORE_NAME, 'readwrite');
      tx1.objectStore(PROJECT_STORE_NAME).put(project);
      
      // Save metadata for faster listing
      const tx2 = db.transaction(PROJECT_META_STORE_NAME, 'readwrite');
      tx2.objectStore(PROJECT_META_STORE_NAME).put(project);

      // Update local state
      setProjects(prev => {
        const existing = prev.find(p => p.id === projectId);
        if (existing) {
          return prev.map(p => p.id === projectId ? project : p);
        } else {
          return [project, ...prev];
        }
      });

      return project;
    } catch (error) {
      console.error('Error saving project:', error);
      throw error;
    }
  }, []);

  // Load a specific project
  const loadProject = useCallback(async (projectId: string): Promise<SavedProject | null> => { // Returns full object, including type/boardImages
    try {
      const db = await openProjectDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PROJECT_STORE_NAME, 'readonly');
        const req = tx.objectStore(PROJECT_STORE_NAME).get(projectId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (error) {
      console.error('Error loading project:', error);
      return null;
    }
  }, []);

  // Delete a project
  const deleteProject = useCallback(async (projectId: string) => {
    try {
      const db = await openProjectDB();
      
      // Delete from both stores
      const tx1 = db.transaction(PROJECT_STORE_NAME, 'readwrite');
      tx1.objectStore(PROJECT_STORE_NAME).delete(projectId);
      
      const tx2 = db.transaction(PROJECT_META_STORE_NAME, 'readwrite');
      tx2.objectStore(PROJECT_META_STORE_NAME).delete(projectId);

      // Update local state
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (error) {
      console.error('Error deleting project:', error);
      throw error;
    }
  }, []);

  // Update project metadata (for renaming, etc.)
  const updateProjectMetadata = useCallback(async (projectId: string, updates: Partial<SavedProject>) => {
    try {
      const db = await openProjectDB();
      
      // Get current project
      const currentProject = await loadProject(projectId);
      if (!currentProject) return;

      const updatedProject = {
        ...currentProject,
        ...updates,
        updatedAt: Date.now(),
      };

      // Update both stores
      const tx1 = db.transaction(PROJECT_STORE_NAME, 'readwrite');
      tx1.objectStore(PROJECT_STORE_NAME).put(updatedProject);
      
      const tx2 = db.transaction(PROJECT_META_STORE_NAME, 'readwrite');
      tx2.objectStore(PROJECT_META_STORE_NAME).put(updatedProject);

      // Update local state
      setProjects(prev => prev.map(p => p.id === projectId ? updatedProject : p));
    } catch (error) {
      console.error('Error updating project metadata:', error);
      throw error;
    }
  }, [loadProject]);

  // Generate thumbnail from image blob
  const generateThumbnail = useCallback(async (imageBlob: Blob): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Set canvas size for thumbnail (200x150)
        const maxWidth = 200;
        const maxHeight = 150;
        const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
        
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        
        // Draw image
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Convert to data URL
        const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(thumbnailUrl);
      };
      
      img.src = URL.createObjectURL(imageBlob);
    });
  }, []);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return {
    projects,
    loading,
    saveProject,
    loadProject,
    deleteProject,
    updateProjectMetadata,
    generateThumbnail,
    refreshProjects: loadProjects,
  };
}; 