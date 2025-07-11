export type AnnotationType = 'rectangle' | 'circle' | 'solid-circle' | 'text';

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
}

export interface ImageData {
  id: string;
  file?: File;
  fileName?: string;
  url: string;
  width: number;
  height: number;
  annotations: Annotation[];
} 