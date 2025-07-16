import React, { useState, useRef, DragEvent } from 'react';
import { SavedProject } from '../types/annotation';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import DownloadIcon from '@mui/icons-material/Download';
import SearchIcon from '@mui/icons-material/Search';
import { Box, Card, CardContent, CardActions, Button, Typography, IconButton, Paper, Tooltip } from '@mui/material';
import Grid from '@mui/system/Grid';

interface GalleryProps {
  projects: SavedProject[]; // Now includes optional type and boardImages for board projects
  onSelectProject: (project: SavedProject) => void;
  onDeleteProject: (projectId: string) => void;
  onUploadNew: (file: File | FileList) => void;
  onExportProject: (project: SavedProject) => void;
  updateProjectMetadata?: (projectId: string, updates: Partial<SavedProject>) => Promise<void>;
}

export const Gallery: React.FC<GalleryProps> = ({
  projects,
  onSelectProject,
  onDeleteProject,
  onUploadNew,
  onExportProject,
  updateProjectMetadata,
}) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter projects based on search term
  const filteredProjects = projects.filter(project => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.trim().toLowerCase();
    // Check project name, file name, and any annotation label
    const inName = (project.name || '').toLowerCase().includes(term);
    const inFile = (project.fileName || '').toLowerCase().includes(term);
    const inLabels = (project.annotations || []).some(a => (a.text || '').toLowerCase().includes(term));
    return inName || inFile || inLabels;
  });

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUploadNew(e.dataTransfer.files); // Pass the full FileList
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUploadNew(e.target.files); // Pass the full FileList
    }
  };

  const startEditingName = (project: SavedProject) => {
    setEditingName(project.id);
    setEditingText(project.name);
  };

  const saveName = async (projectId: string) => {
    if (editingText.trim() && updateProjectMetadata) {
      await updateProjectMetadata(projectId, { name: editingText });
    }
    setEditingName(null);
    setEditingText('');
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'linear-gradient(135deg, #f7f7fa 0%, #e9e9f3 100%)', py: 6, fontFamily: 'Inter, Segoe UI, Helvetica Neue, Arial, sans-serif' }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 6, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2, gap: 2 }}>
            <img src="/VizAudit Logo.png" alt="VizAudit Logo" style={{ width: 56, height: 56, borderRadius: 12, marginRight: 16 }} />
            <Typography variant="h3" fontWeight={800} color="text.primary" sx={{ fontFamily: 'Inter, Segoe UI, Helvetica Neue, Arial, sans-serif', letterSpacing: -1 }}>
              VizAudit Gallery
            </Typography>
          </Box>
          <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto', mb: 2 }}>
            Your saved annotation projects. Click on any project to continue working or upload a new image to start fresh.
          </Typography>
          {/* Search input */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mt: 2 }}>
            <SearchIcon sx={{ color: 'grey.500', mr: 1 }} />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by title, file name, or label..."
              style={{
                fontSize: 16,
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid #ccc',
                width: 340,
                maxWidth: '90vw',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </Box>
        </Box>

        {/* Upload Area */}
        <Paper
          elevation={isDragActive ? 8 : 2}
          sx={{
            mb: 6,
            border: '2px dashed',
            borderColor: isDragActive ? 'primary.main' : 'grey.300',
            borderRadius: 4,
            p: 5,
            textAlign: 'center',
            bgcolor: isDragActive ? 'primary.lighter' : 'background.paper',
            transition: 'all 0.2s',
            boxShadow: isDragActive ? 8 : 2,
            backdropFilter: 'blur(2px)',
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple // Allow multiple image selection
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            sx={{ px: 4, py: 1.5, borderRadius: 999, fontWeight: 600, fontSize: 16, boxShadow: 2 }}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload New Image
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            or drag and drop an image here
          </Typography>
        </Paper>

        {/* Projects Grid */}
        {filteredProjects.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 10 }}>
            <Typography variant="h1" color="grey.300" sx={{ fontSize: 80, mb: 2 }}>📁</Typography>
            <Typography variant="h5" color="text.secondary" fontWeight={600} gutterBottom>No projects yet</Typography>
            <Typography variant="body1" color="text.secondary">Upload your first image to get started!</Typography>
          </Box>
        ) : (
          <Grid container spacing={3} py={4}>
            {filteredProjects.map((project) => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3, xl: 3 }} key={project.id}>
                <Card sx={{ borderRadius: 3, boxShadow: 4, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 180, maxWidth: 220, mx: 'auto' }}>
                  {/* Thumbnail */}
                  <Box sx={{ position: 'relative', aspectRatio: '16/9', bgcolor: 'grey.100', display: 'flex', alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: 'hidden' }}>
                    {project.thumbnailUrl ? (
                      <img
                        src={project.thumbnailUrl}
                        alt={project.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = '';
                        }}
                      />
                    ) : (
                      <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="h5" color="grey.300">No Image</Typography>
                      </Box>
                    )}
                  </Box>
                  {/* Project Info */}
                  <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 0.5, p: 1.5 }}>
                    {editingName === project.id ? (
                      <input
                        type="text"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onBlur={() => saveName(project.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveName(project.id);
                          if (e.key === 'Escape') {
                            setEditingName(null);
                            setEditingText('');
                          }
                        }}
                        style={{ fontSize: 16, fontWeight: 700, border: '1px solid #90caf9', borderRadius: 6, padding: 2, width: '100%' }}
                        autoFocus
                      />
                    ) : (
                      <Typography
                        variant="subtitle1"
                        fontWeight={700}
                        color="text.primary"
                        sx={{ cursor: 'pointer', mb: 0.2, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 16 }}
                        onClick={() => startEditingName(project)}
                        title="Click to edit name"
                      >
                        {project.name}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 13 }}>{project.fileName}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'grey.500', fontSize: 11, mt: 0.2 }}>
                      <span>{project.annotations.length} annotation{project.annotations.length !== 1 ? 's' : ''}</span>
                      <span>·</span>
                      <span>{formatDate(project.updatedAt)}</span>
                    </Box>
                  </CardContent>
                  {/* Action Buttons */}
                  <CardActions sx={{ justifyContent: 'center', px: 1, pb: 1, pt: 0 }}>
                    <Tooltip title="Open">
                      <IconButton color="primary" onClick={() => onSelectProject(project)} size="small">
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Export">
                      <IconButton color="success" onClick={() => onExportProject(project)} size="small">
                        <DownloadIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton color="error" onClick={() => onDeleteProject(project.id)} size="small">
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </Box>
  );
}; 