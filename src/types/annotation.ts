export type AnnotationType = 'rectangle' | 'circle' | 'solid-circle' | 'text' | 'pencil';

export interface Annotation {
  id: string;
  type: AnnotationType;
  number: number;
  position: {
    x: number;
    y: number;
  };
  size: {
    width: number;
    height: number;
  };
  color: string;
  text: string;
  alignment: 'left' | 'center' | 'right';
  labelPosition?: {
    x: number;
    y: number;
  };
  // For pencil annotations
  points?: { x: number; y: number }[];
}

export interface ImageData {
  id: string;
  fileName?: string;
  width: number;
  height: number;
  annotations: Annotation[];
}

export interface SavedProject {
  id: string;
  name: string;
  fileName: string;
  imageKey: string;
  width: number;
  height: number;
  annotations: Annotation[];
  title: string;
  createdAt: number;
  updatedAt: number;
  thumbnailUrl?: string;
  // Board project support
  type?: string;
  boardImages?: BoardImage[];
}

export interface BoardImage {
  id: string;
  url: string;
  fileName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  annotations: Annotation[];
}

export type ProjectType = 'single' | 'board';

export interface Project {
  id: string;
  type: ProjectType;
  title: string;
  // For single-image projects:
  imageKey?: string;
  fileName?: string;
  width?: number;
  height?: number;
  annotations?: Annotation[];
  // For board projects:
  boardImages?: BoardImage[];
  // ...other metadata
}

// New robust annotation model for board projects
export type BoardAnnotationType = 'pointer' | 'rectangle' | 'circle' | 'dot' | 'pencil';

export interface BoardAnnotation {
  id: string;
  type: BoardAnnotationType;
  // Relative coordinates (0–1) for position and size
  relativePosition: { x: number; y: number };
  relativeSize: { width: number; height: number };
  color: string;
  label: string;
  labelSide: 'left' | 'right'; // auto-calculated, can be overridden
  // Optionally, store connector info if needed
}

// For board images using the new model
export interface BoardImageV2 {
  id: string;
  url: string;
  fileName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  annotations: BoardAnnotation[];
} 