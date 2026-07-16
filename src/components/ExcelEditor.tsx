import React, { useState, useEffect, useRef } from 'react';
import ExcelJS from 'exceljs';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faSpinner, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';

interface ExcelEditorProps {
  fileUrl: string;
  fileName: string;
  onSave: (file: File) => void;
  onCancel: () => void;
}

interface CellData {
  value: string | number | null;
  style?: {
    bold?: boolean;
    italic?: boolean;
    color?: string;
    bgColor?: string;
  };
}

const ExcelEditor: React.FC<ExcelEditorProps> = ({ fileUrl, fileName, onSave, onCancel }) => {
  const [workbook, setWorkbook] = useState<ExcelJS.Workbook | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [cellData, setCellData] = useState<Map<string, CellData>>(new Map());
  const [sheetDimensions, setSheetDimensions] = useState({ maxRow: 20, maxCol: 10 });
  const [colWidths, setColWidths] = useState<number[]>([]);
  const tableRef = useRef<HTMLDivElement>(null);

  /** Largeur estimée en px à partir du nombre de caractères (monospace ~8px, avec marge) */
  const CHAR_WIDTH_PX = 9;
  const MIN_COL_WIDTH = 56;
  const MAX_COL_WIDTH = 320;

  useEffect(() => {
    loadExcelDocument();
  }, [fileUrl]);

  const loadExcelDocument = async () => {
    setLoading(true);
    setError(null);
    try {
      let arrayBuffer: ArrayBuffer;
      
      // Si c'est une URL blob, on doit la traiter différemment
      if (fileUrl.startsWith('blob:')) {
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error('Impossible de charger le fichier');
        
        // Vérifier que le type de contenu est correct
        const contentType = response.headers.get('content-type');
        if (contentType && !contentType.includes('spreadsheet') && !contentType.includes('excel') && !contentType.includes('octet-stream')) {
          console.warn('Type de contenu inattendu:', contentType);
        }
        
        arrayBuffer = await response.arrayBuffer();
        
        // Vérifier que le fichier n'est pas vide
        if (arrayBuffer.byteLength === 0) {
          throw new Error('Le fichier Excel est vide');
        }
        
        // Vérifier les premiers bytes pour s'assurer que c'est un fichier ZIP/Excel
        const view = new Uint8Array(arrayBuffer);
        const zipSignature = [0x50, 0x4B, 0x03, 0x04]; // PK.. (signature ZIP)
        const isValidZip = zipSignature.every((byte, index) => view[index] === byte);
        
        if (!isValidZip && arrayBuffer.byteLength > 0) {
          // Peut-être un fichier .xls (ancien format) ou corrompu
          console.warn('Le fichier ne semble pas être un fichier Excel valide (.xlsx)');
        }
      } else {
        // Pour les URLs publiques
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error('Impossible de charger le fichier');
        arrayBuffer = await response.arrayBuffer();
      }
      
      // Créer un nouveau workbook et charger le fichier
      const wb = new ExcelJS.Workbook();
      
      // Utiliser l'option useSharedStrings pour améliorer la compatibilité
      await wb.xlsx.load(arrayBuffer);
      
      // Vérifier que le workbook a au moins une feuille
      if (wb.worksheets.length === 0) {
        throw new Error('Le fichier Excel ne contient aucune feuille');
      }
      
      setWorkbook(wb);
      
      // Charger les données de la première feuille
      loadSheetData(wb.worksheets[0]);
    } catch (err: any) {
      console.error('Erreur lors du chargement du fichier Excel:', err);
      
      // Message d'erreur plus explicite
      let errorMessage = 'Erreur lors du chargement du fichier Excel';
      if (err.message) {
        if (err.message.includes('zip') || err.message.includes('central directory')) {
          errorMessage = 'Le fichier Excel semble être corrompu ou dans un format non supporté. Veuillez vérifier que c\'est bien un fichier .xlsx valide.';
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  /** Retourne la valeur affichable d'une cellule (nombre, date, formule, rich text, etc.) */
  const getCellDisplayValue = (cell: ExcelJS.Cell): string | number | null => {
    const v = cell.value;
    if (v === null || v === undefined) return '';
    if (typeof v === 'string' || typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 'Vrai' : 'Faux';
    if (v instanceof Date) return v.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: v.getHours() || v.getMinutes() ? 'short' : undefined });
    if (typeof v === 'object') {
      const o = v as unknown as Record<string, unknown>;
      if (Array.isArray(o.richText) && o.richText.length) {
        return (o.richText as Array<{ text?: string }>).map(t => t.text ?? '').join('');
      }
      if (typeof o.result !== 'undefined' && o.result !== null) return String(o.result);
      if (typeof o.text === 'string') return o.text;
      if (o.formula && typeof o.result !== 'undefined') return String(o.result);
    }
    return String(v);
  };

  const loadSheetData = (worksheet: ExcelJS.Worksheet) => {
    const data = new Map<string, CellData>();
    let maxRow = 0;
    let maxCol = 0;

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const key = `${rowNumber}-${colNumber}`;
        const displayValue = getCellDisplayValue(cell);
        const value = displayValue === '' || displayValue === null ? '' : displayValue;
        data.set(key, {
          value: typeof value === 'number' ? value : (value ?? ''),
          style: {
            bold: cell.font?.bold,
            italic: cell.font?.italic,
            color: cell.font?.color?.argb ? `#${String(cell.font.color.argb).slice(2)}` : undefined,
            bgColor: (cell.fill && 'fgColor' in cell.fill && cell.fill.fgColor?.argb) ? `#${String((cell.fill as { fgColor?: { argb?: string } }).fgColor?.argb).slice(2)}` : undefined
          }
        });
        if (rowNumber > maxRow) maxRow = rowNumber;
        if (colNumber > maxCol) maxCol = colNumber;
      });
    });

    setSheetDimensions({ maxRow: Math.max(maxRow, 1), maxCol: Math.max(maxCol, 1) });
    setCellData(data);

    // Adapter la largeur de chaque colonne au contenu
    const widths: number[] = [];
    for (let c = 1; c <= maxCol; c++) {
      let maxLen = 3;
      for (let r = 1; r <= maxRow; r++) {
        const key = `${r}-${c}`;
        const cell = data.get(key);
        if (cell?.value !== undefined && cell.value !== null && cell.value !== '') {
          const s = String(cell.value);
          const lines = s.split(/\r?\n/);
          const maxLineLen = Math.max(...lines.map(l => l.length));
          if (maxLineLen > maxLen) maxLen = maxLineLen;
        }
      }
      widths.push(Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, maxLen * CHAR_WIDTH_PX)));
    }
    setColWidths(widths);
  };

  const handleSave = async () => {
    if (!workbook) return;
    
    setSaving(true);
    try {
      const worksheet = workbook.worksheets[activeSheetIndex];
      
      // Appliquer les modifications
      cellData.forEach((data, key) => {
        const [rowStr, colStr] = key.split('-');
        const row = parseInt(rowStr);
        const col = parseInt(colStr);
        
        try {
          const cell = worksheet.getCell(row, col);
          cell.value = data.value;
          
          if (data.style) {
            cell.font = {
              ...cell.font,
              bold: data.style.bold,
              italic: data.style.italic,
              color: data.style.color ? { argb: data.style.color.replace('#', 'FF') } : undefined
            };
            
            if (data.style.bgColor) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: data.style.bgColor.replace('#', 'FF') }
              };
            }
          }
        } catch (cellErr) {
          console.warn(`Erreur lors de la mise à jour de la cellule ${row}-${col}:`, cellErr);
        }
      });
      
      // Générer le fichier avec les options appropriées
      const buffer = await workbook.xlsx.writeBuffer({
        useSharedStrings: true
      });
      
      // Vérifier que le buffer n'est pas vide
      if (!buffer || buffer.byteLength === 0) {
        throw new Error('Erreur lors de la génération du fichier Excel');
      }
      
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      // Vérifier que le blob est valide
      if (blob.size === 0) {
        throw new Error('Le fichier Excel généré est vide');
      }
      
      const file = new File([blob], fileName, { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      onSave(file);
    } catch (err: any) {
      console.error('Erreur lors de la sauvegarde:', err);
      setError(err.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const getCellValue = (row: number, col: number): string => {
    const key = `${row}-${col}`;
    const data = cellData.get(key);
    const v = data?.value;
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v);
    return String(v);
  };

  /** Lettre(s) de colonne Excel : 1 -> A, 27 -> AA */
  const getColumnLetter = (colIndex: number): string => {
    let s = '';
    let n = colIndex;
    while (n >= 0) {
      s = String.fromCharCode((n % 26) + 65) + s;
      n = Math.floor(n / 26) - 1;
    }
    return s;
  };

  const setCellValue = (row: number, col: number, value: string) => {
    const key = `${row}-${col}`;
    const newData = new Map(cellData);
    newData.set(key, { value });
    setCellData(newData);
  };

  const addRow = () => {
    if (!workbook) return;
      const worksheet = workbook.worksheets[activeSheetIndex];
      worksheet.addRow([]);
      loadSheetData(worksheet);
  };

  const addColumn = () => {
    if (!workbook) return;
    const worksheet = workbook.worksheets[activeSheetIndex];
    // Ajouter une colonne vide (ExcelJS gère automatiquement les colonnes)
    loadSheetData(worksheet);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <FontAwesomeIcon icon={faSpinner} className="animate-spin text-4xl text-blue-600 mb-4" />
          <p className="text-gray-600">Chargement du fichier Excel...</p>
        </div>
      </div>
    );
  }

  if (error || !workbook) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="text-center max-w-md">
          <p className="text-red-600 mb-4 font-semibold">{error || 'Fichier Excel invalide'}</p>
          <p className="text-sm text-gray-600 mb-4">
            {error?.includes('zip') || error?.includes('central directory') 
              ? 'Le fichier Excel semble être corrompu ou dans un format non supporté. Assurez-vous que c\'est bien un fichier .xlsx valide et non un fichier .xls (ancien format).'
              : 'Impossible de charger le fichier Excel. Veuillez vérifier que le fichier n\'est pas corrompu.'}
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => {
                setError(null);
                loadExcelDocument();
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Réessayer
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    );
  }

  const worksheet = workbook.worksheets[activeSheetIndex];
  const maxRows = Math.max(sheetDimensions.maxRow, 20);
  const maxCols = Math.max(sheetDimensions.maxCol, 10);

  return (
    <div className="flex flex-col h-full">
      {/* Barre d'outils */}
      <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-gray-900">Éditeur Excel</h3>
          {workbook.worksheets.length > 1 && (
            <select
              value={activeSheetIndex}
              onChange={(e) => {
                const index = parseInt(e.target.value);
                setActiveSheetIndex(index);
                loadSheetData(workbook.worksheets[index]);
              }}
              className="px-3 py-1 border border-gray-300 rounded-lg"
            >
              {workbook.worksheets.map((sheet, index) => (
                <option key={index} value={index}>{sheet.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={addRow}
            className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-1"
            title="Ajouter une ligne"
          >
            <FontAwesomeIcon icon={faPlus} />
            Ligne
          </button>
          <button
            onClick={addColumn}
            className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-1"
            title="Ajouter une colonne"
          >
            <FontAwesomeIcon icon={faPlus} />
            Colonne
          </button>
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

      {/* Tableau Excel — colonnes adaptées au contenu */}
      <div className="flex-1 overflow-auto bg-white p-4" ref={tableRef}>
        <div className="inline-block border border-gray-300 min-w-0">
          <table className="border-collapse table-fixed w-full">
            <colgroup>
              <col style={{ width: 40, minWidth: 40 }} />
              {Array.from({ length: maxCols }, (_, i) => (
                <col
                  key={i}
                  style={{
                    width: colWidths[i] ?? MIN_COL_WIDTH,
                    minWidth: colWidths[i] ?? MIN_COL_WIDTH,
                    maxWidth: MAX_COL_WIDTH
                  }}
                />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="h-9 bg-gray-100 border border-gray-300 text-center text-xs font-semibold text-gray-600 sticky left-0 z-10" />
                {Array.from({ length: maxCols }, (_, i) => (
                  <th
                    key={i}
                    className="h-9 bg-gray-100 border border-gray-300 text-center text-xs font-semibold text-gray-600"
                  >
                    {getColumnLetter(i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxRows }, (_, rowIndex) => {
                const rowNum = rowIndex + 1;
                return (
                  <tr key={rowIndex}>
                    <td className="h-9 min-h-[2rem] bg-gray-50 border border-gray-300 text-center text-xs font-semibold text-gray-600 sticky left-0 z-10 align-top">
                      {rowNum}
                    </td>
                    {Array.from({ length: maxCols }, (_, colIndex) => {
                      const colNum = colIndex + 1;
                      const cellKey = `${rowNum}-${colNum}`;
                      const isEditing = editingCell?.row === rowNum && editingCell?.col === colNum;
                      const value = getCellValue(rowNum, colNum);
                      const cellStyle = cellData.get(cellKey)?.style;

                      return (
                        <td
                          key={colIndex}
                          className="border border-gray-300 p-0 align-top overflow-hidden"
                          style={{
                            minWidth: colWidths[colIndex] ?? MIN_COL_WIDTH,
                            maxWidth: MAX_COL_WIDTH
                          }}
                        >
                          {isEditing ? (
                            <input
                              type="text"
                              value={value}
                              onChange={(e) => setCellValue(rowNum, colNum, e.target.value)}
                              onBlur={() => setEditingCell(null)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  setEditingCell(null);
                                }
                              }}
                              className="w-full min-h-[2rem] h-auto py-1.5 px-2 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm box-border"
                              style={{
                                fontWeight: cellStyle?.bold ? 'bold' : undefined,
                                fontStyle: cellStyle?.italic ? 'italic' : undefined,
                                color: cellStyle?.color,
                                backgroundColor: cellStyle?.bgColor
                              }}
                              autoFocus
                            />
                          ) : (
                            <div
                              onClick={() => setEditingCell({ row: rowNum, col: colNum })}
                              className="w-full min-h-[2rem] py-1.5 px-2 cursor-pointer hover:bg-blue-50/70 text-sm break-words whitespace-normal text-left"
                              style={{
                                fontWeight: cellStyle?.bold ? 'bold' : undefined,
                                fontStyle: cellStyle?.italic ? 'italic' : undefined,
                                color: cellStyle?.color,
                                backgroundColor: cellStyle?.bgColor
                              }}
                              title={value}
                            >
                              {value || '\u00A0'}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ExcelEditor;

