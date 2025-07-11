import { useState, useCallback } from 'react';
import { Annotation, AnnotationType } from '../types/annotation';

export const useAnnotations = (initialAnnotations: Annotation[] = []) => {
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
  const [nextNumber, setNextNumber] = useState(1);
  const [history, setHistory] = useState<Annotation[][]>([]);

  const addAnnotation = useCallback((annotation: Omit<Annotation, 'id' | 'number'>) => {
    setHistory(prev => [...prev, annotations]);
    const newAnnotation: Annotation = {
      ...annotation,
      id: `annotation-${Date.now()}-${Math.random()}`,
      number: nextNumber,
    };
    
    setAnnotations(prev => [...prev, newAnnotation]);
    setNextNumber(prev => prev + 1);
    
    return newAnnotation;
  }, [nextNumber, annotations]);

  const updateAnnotation = useCallback((id: string, updates: Partial<Annotation>) => {
    setHistory(prev => [...prev, annotations]);
    setAnnotations(prev => 
      prev.map(annotation => 
        annotation.id === id ? { ...annotation, ...updates } : annotation
      )
    );
  }, [annotations]);

  const deleteAnnotation = useCallback((id: string) => {
    setHistory(prev => [...prev, annotations]);
    setAnnotations(prev => prev.filter(annotation => annotation.id !== id));
  }, [annotations]);

  const clearAnnotations = useCallback(() => {
    setHistory(prev => [...prev, annotations]);
    setAnnotations([]);
    setNextNumber(1);
  }, [annotations]);

  const undo = useCallback(() => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setAnnotations(last);
      return prev.slice(0, -1);
    });
  }, []);

  const getAnnotationByNumber = useCallback((number: number) => {
    return annotations.find(annotation => annotation.number === number);
  }, [annotations]);

  return {
    annotations,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    clearAnnotations,
    undo,
    getAnnotationByNumber,
  };
}; 