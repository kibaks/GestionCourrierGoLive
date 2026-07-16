import React, { useState, useEffect, useRef } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faSpinner } from '@fortawesome/free-solid-svg-icons';

interface WordEditorProps {
  fileUrl: string;
  fileName: string;
  onSave: (file: File) => void;
  onCancel: () => void;
}

const WordEditor: React.FC<WordEditorProps> = ({ fileUrl, fileName, onSave, onCancel }) => {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quillRef = useRef<ReactQuill>(null);

  useEffect(() => {
    loadWordDocument();
  }, [fileUrl]);

  const loadWordDocument = async () => {
    setLoading(true);
    setError(null);
    try {
      // Charger le fichier
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error('Impossible de charger le fichier');
      
      const arrayBuffer = await response.arrayBuffer();
      
      // Convertir Word en HTML avec mammoth
      const result = await mammoth.convertToHtml({ arrayBuffer });
      setHtmlContent(result.value);
      
      // Afficher les avertissements s'il y en a
      if (result.messages.length > 0) {
        console.warn('Avertissements mammoth:', result.messages);
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement du document Word:', err);
      setError(err.message || 'Erreur lors du chargement du document');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Obtenir le contenu HTML de l'éditeur
      const editorContent = quillRef.current?.getEditor().root.innerHTML || htmlContent;
      
      // Convertir HTML en Word avec docx
      // Pour une conversion simple, on crée un nouveau document avec le contenu
      const doc = new Document({
        sections: [{
          properties: {},
          children: convertHtmlToDocx(editorContent)
        }]
      });

      // Générer le fichier Word
      const blob = await Packer.toBlob(doc);
      const file = new File([blob], fileName, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      
      onSave(file);
    } catch (err: any) {
      console.error('Erreur lors de la sauvegarde:', err);
      setError(err.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  // Convertir HTML simple en éléments docx
  const convertHtmlToDocx = (html: string): Paragraph[] => {
    // Parser HTML basique
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const paragraphs: Paragraph[] = [];

    // Fonction récursive pour convertir les nœuds
    const convertNode = (node: Node): Paragraph[] => {
      const result: Paragraph[] = [];
      
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text) {
          result.push(new Paragraph({
            children: [new TextRun(text)]
          }));
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const tagName = element.tagName.toLowerCase();
        const text = element.textContent?.trim() || '';
        
        if (text) {
          if (tagName === 'h1') {
            result.push(new Paragraph({
              heading: HeadingLevel.HEADING_1,
              children: [new TextRun(text)]
            }));
          } else if (tagName === 'h2') {
            result.push(new Paragraph({
              heading: HeadingLevel.HEADING_2,
              children: [new TextRun(text)]
            }));
          } else if (tagName === 'h3') {
            result.push(new Paragraph({
              heading: HeadingLevel.HEADING_3,
              children: [new TextRun(text)]
            }));
          } else if (tagName === 'p' || tagName === 'div') {
            // Extraire le texte avec formatage basique
            const textRuns: TextRun[] = [];
            const processChildNodes = (el: Element) => {
              Array.from(el.childNodes).forEach(child => {
                if (child.nodeType === Node.TEXT_NODE) {
                  const text = child.textContent?.trim();
                  if (text) {
                    textRuns.push(new TextRun(text));
                  }
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                  const childEl = child as Element;
                  const childTag = childEl.tagName.toLowerCase();
                  const childText = childEl.textContent?.trim() || '';
                  
                  if (childText) {
                    if (childTag === 'strong' || childTag === 'b') {
                      textRuns.push(new TextRun({ text: childText, bold: true }));
                    } else if (childTag === 'em' || childTag === 'i') {
                      textRuns.push(new TextRun({ text: childText, italics: true }));
                    } else if (childTag === 'u') {
                      textRuns.push(new TextRun({ text: childText, underline: {} }));
                    } else {
                      textRuns.push(new TextRun(childText));
                    }
                  }
                }
              });
            };
            
            processChildNodes(element);
            
            if (textRuns.length > 0) {
              result.push(new Paragraph({
                children: textRuns
              }));
            } else if (text) {
              result.push(new Paragraph({
                children: [new TextRun(text)]
              }));
            }
          } else {
            // Pour les autres éléments, traiter récursivement
            Array.from(element.childNodes).forEach(child => {
              result.push(...convertNode(child));
            });
          }
        }
      }
      
      return result;
    };

    // Traiter tous les nœuds du body
    Array.from(doc.body.childNodes).forEach(node => {
      paragraphs.push(...convertNode(node));
    });

    return paragraphs.length > 0 ? paragraphs : [
      new Paragraph({
        children: [new TextRun('Document vide')]
      })
    ];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <FontAwesomeIcon icon={faSpinner} className="animate-spin text-4xl text-blue-600 mb-4" />
          <p className="text-gray-600">Chargement du document Word...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
        >
          Fermer
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Barre d'outils */}
      <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
        <h3 className="text-lg font-semibold text-gray-900">Éditeur Word</h3>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <FontAwesomeIcon icon={saving ? faSpinner : faSave} className={saving ? 'animate-spin' : ''} />
            {saving ? 'Sauvegarde...' : 'Enregistrer'}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Annuler
          </button>
        </div>
      </div>

      {/* Éditeur */}
      <div className="flex-1 overflow-auto bg-white">
        <ReactQuill
          ref={quillRef}
          theme="snow"
          value={htmlContent}
          onChange={setHtmlContent}
          style={{ height: '100%' }}
          modules={{
            toolbar: [
              [{ 'header': [1, 2, 3, false] }],
              ['bold', 'italic', 'underline', 'strike'],
              [{ 'list': 'ordered'}, { 'list': 'bullet' }],
              [{ 'align': [] }],
              ['link', 'image'],
              [{ 'color': [] }, { 'background': [] }],
              ['clean']
            ]
          }}
        />
      </div>
    </div>
  );
};

export default WordEditor;

