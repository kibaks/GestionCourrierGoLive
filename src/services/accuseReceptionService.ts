/**
 * Service de génération de l'accusé de réception (PDF tamponné).
 * Reprend le document scanné/joint et appose un cachet "ACCUSE DE RECU" sur la 1ère page.
 */

import { jsPDF } from 'jspdf';
import type { Courrier, CategorieFichier, Utilisateur } from '../types';
import { cachetAccuseService, CachetAccuseConfig } from './cachetAccuseService';
import { categorieFichierService } from './categorieFichierService';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/** Charge une image depuis une URL. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Convertit mm en pixels selon la largeur du canvas et la largeur réelle de la page en mm. */
function mmToPx(mm: number, canvasWidthPx: number, pageWidthMm = A4_WIDTH_MM): number {
  return (mm / pageWidthMm) * canvasWidthPx;
}

/** Dessine le tampon AR sur un canvas 2D. */
function drawStampOnCanvas(
  ctx: CanvasRenderingContext2D,
  config: CachetAccuseConfig,
  data: {
    date: string;
    numero: string;
    annexes: string;
    par: string;
    expediteur: string;
    destinataire: string;
  },
  canvasWidth: number,
  canvasHeight: number,
  pageWidthMm = A4_WIDTH_MM
): void {
  const x = mmToPx(config.positionX, canvasWidth, pageWidthMm);
  const y = mmToPx(config.positionY, canvasWidth, pageWidthMm);
  const w = mmToPx(config.largeur, canvasWidth, pageWidthMm);
  const h = mmToPx(config.hauteur, canvasWidth, pageWidthMm);

  ctx.save();

  // Inclinaison
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.translate(cx, cy);
  ctx.rotate((config.inclinaison * Math.PI) / 180);
  ctx.translate(-cx, -cy);

  // Fond
  if (config.couleurFond && config.couleurFond !== 'transparent') {
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = config.couleurFond;
    if (config.forme === 'rond') {
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, w, h);
    }
    ctx.globalAlpha = 1;
  }

  // Bordure
  ctx.strokeStyle = config.couleurEncre;
  ctx.lineWidth = Math.max(2, mmToPx(1, canvasWidth, pageWidthMm) / 4);
  if (config.bordureDouble) {
    const pad = ctx.lineWidth * 2;
    if (config.forme === 'rond') {
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2 - pad, h / 2 - pad, 0, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, 2 * Math.PI);
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, w, h);
      ctx.strokeRect(x + pad, y + pad, w - pad * 2, h - pad * 2);
    }
  } else {
    if (config.forme === 'rond') {
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, 2 * Math.PI);
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, w, h);
    }
  }

  // Texte
  ctx.fillStyle = config.couleurEncre;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const titleSize = Math.max(10, h * 0.12);
  const lineSize = Math.max(8, h * 0.09);
  const paddingX = w * 0.05;
  const paddingY = h * 0.08;

  // Titre
  ctx.font = `bold ${titleSize}px Arial, sans-serif`;
  ctx.fillText('ACCUSÉ DE RÉCEPTION', cx, y + paddingY);

  // Lignes
  ctx.textAlign = 'left';
  ctx.font = `bold ${lineSize}px Arial, sans-serif`;
  const labelX = x + paddingX;
  const valueX = x + w * 0.45;
  let lineY = y + paddingY + titleSize + h * 0.08;
  const lineGap = lineSize * 1.4;

  const drawLine = (label: string, value: string) => {
    ctx.font = `bold ${lineSize}px Arial, sans-serif`;
    ctx.fillText(label, labelX, lineY);
    ctx.font = `${lineSize}px Arial, sans-serif`;
    ctx.fillText(value, valueX, lineY);
    lineY += lineGap;
  };

  // Tronque les valeurs trop longues pour rester dans le cachet
  const truncate = (s: string, max = 20): string =>
    s && s.length > max ? s.slice(0, max - 1) + '…' : s;

  if (config.organisation) {
    drawLine('ORGANISME :', config.organisation);
  }
  drawLine('LE :', data.date);
  drawLine('SOUS N° :', data.numero);
  if (data.expediteur) drawLine('EXPEDITEUR :', truncate(data.expediteur));
  if (data.destinataire) drawLine('DESTINATAIRE :', truncate(data.destinataire));
  drawLine('ANNEXES :', data.annexes);
  drawLine('PAR :', data.par);

  ctx.restore();
}

/** Génère un QR code en data URL (optionnel). */
async function generateQRDataUrl(text: string, size = 60): Promise<string | null> {
  try {
    const QRCode = (await import('qrcode')).default;
    return await QRCode.toDataURL(text, { width: size, margin: 1, type: 'image/png' });
  } catch {
    return null;
  }
}

/** Rend une page PDF sur un canvas. */
async function renderPdfPage(
  pdfDoc: any,
  pageNum: number,
  scale = 2
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { canvas, width: viewport.width, height: viewport.height };
}

/** Convertit un canvas en image JPEG dataURL. */
function canvasToJpegDataUrl(canvas: HTMLCanvasElement, quality = 0.9): string {
  return canvas.toDataURL('image/jpeg', quality);
}

/** Résout l'extension d'un fichier : utilise le champ explicite sinon déduit depuis le nom. */
function resolveExtension(file: { extension?: string; nom: string }): string {
  if (file.extension) return file.extension.toLowerCase();
  const dot = file.nom.lastIndexOf('.');
  return dot !== -1 ? file.nom.slice(dot + 1).toLowerCase() : '';
}

/** Détermine si le fichier est une image. */
function isImage(extension?: string): boolean {
  return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'tif'].includes((extension || '').toLowerCase());
}

/** Détermine si le fichier est un PDF. */
function isPdf(extension?: string): boolean {
  return (extension || '').toLowerCase() === 'pdf';
}

/** Page de garde fallback (document non PDF/image). */
async function createCoverPage(
  courrier: Courrier,
  user: Utilisateur,
  annexesCount: number,
  cachetConfig: CachetAccuseConfig
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1588;
  canvas.height = 2246;
  const ctx = canvas.getContext('2d')!;

  // Fond blanc
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Tampon
  drawStampOnCanvas(ctx, cachetConfig, {
    date: new Date().toLocaleDateString('fr-FR'),
    numero: courrier.numero,
    annexes: String(annexesCount),
    par: user.nom || '',
    expediteur: courrier.expediteur || '',
    destinataire: courrier.destinataire || '',
  }, canvas.width, canvas.height);

  // Informations courrier
  ctx.fillStyle = '#333333';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const marginX = mmToPx(20, canvas.width);
  const marginY = mmToPx(140, canvas.width);
  const lineH = 40;
  let cy = marginY;

  const lines = [
    'ACCUSE DE RECEPTION',
    '',
    `Reference : ${courrier.numero}`,
    `Objet : ${(courrier.objet || '').replace(/<[^>]*>/g, '')}`,
    `Expediteur : ${courrier.expediteur || 'Non specifie'}`,
    `Destinataire : ${courrier.destinataire || 'Non specifie'}`,
    `Date de reception : ${courrier.dateReception ? new Date(courrier.dateReception).toLocaleDateString('fr-FR') : 'Non specifiee'}`,
    '',
    `Ce document certifie que le courrier et ses pieces jointes`,
    `ont bien ete recus et enregistres.`,
    '',
    `Genere par : ${user.nom || ''} (${user.role || ''})`,
    `Le : ${new Date().toLocaleDateString('fr-FR')}`,
  ];

  ctx.font = 'bold 36px Arial, sans-serif';
  for (const line of lines) {
    if (line === 'ACCUSE DE RECEPTION') {
      ctx.font = 'bold 48px Arial, sans-serif';
      ctx.fillText(line, marginX, cy);
      cy += lineH * 1.5;
      ctx.font = '24px Arial, sans-serif';
    } else if (line === '') {
      cy += lineH;
    } else {
      ctx.fillText(line, marginX, cy);
      cy += lineH;
    }
  }

  return canvasToJpegDataUrl(canvas);
}

/** Génère le PDF accusé de réception en reprenant TOUS les fichiers chargés. */
export async function generateAccusePdf(
  courrier: Courrier,
  mainFile: CategorieFichier,
  user: Utilisateur,
  allFiles: CategorieFichier[]
): Promise<File> {
  const cachetConfig = await cachetAccuseService.getConfig();

  // Fichiers source : tous les fichiers non-AR du courrier
  const sourceFiles = allFiles.filter(
    f => f.type === 'fichier' && !f.estAccuseReception &&
      !f.nom.startsWith('annoté_') && !f.nom.startsWith('traité_') && !f.nom.startsWith('final_')
  );

  const annexesCount = sourceFiles.length;

  const stampData = {
    date: new Date().toLocaleDateString('fr-FR'),
    numero: courrier.numero,
    annexes: String(annexesCount),
    par: user.nom || '',
    expediteur: courrier.expediteur || '',
    destinataire: courrier.destinataire || '',
  };

  // Qualité/échelle de rendu réduites pour limiter la taille du fichier PDF
  const RENDER_SCALE = 1.5;
  const JPEG_QUALITY = 0.7;

  // compress: true active la compression interne du flux PDF (réduit la taille)
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  let isFirstPage = true;
  let pagesRendered = 0;

  // Ajoute une page respectant l'orientation (paysage/portrait) du canvas source,
  // puis y dessine l'image ajustée aux dimensions de la page.
  const addCanvasPage = (canvas: HTMLCanvasElement) => {
    const orientation: 'landscape' | 'portrait' = canvas.width > canvas.height ? 'landscape' : 'portrait';
    pdf.addPage('a4', orientation);
    pagesRendered++;
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgData = canvasToJpegDataUrl(canvas, JPEG_QUALITY);
    pdf.addImage(imgData, 'JPEG', 0, 0, pageW, pageH);
  };

  // Chargement dynamique de pdfjs une seule fois si nécessaire
  let pdfjsLib: any = null;
  const loadPdfJs = async () => {
    if (!pdfjsLib) {
      pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
      ).href;
    }
    return pdfjsLib;
  };

  // Traiter chaque fichier source
  for (const srcFile of sourceFiles) {
    try {
      const fileUrl = await categorieFichierService.getFileDownloadUrl(srcFile);
      const ext = resolveExtension(srcFile);

      if (isPdf(ext)) {
        const lib = await loadPdfJs();
        const res = await fetch(fileUrl);
        const data = await res.arrayBuffer();
        const doc = await lib.getDocument({ data, useSystemFonts: true }).promise;
        const numPages = doc.numPages;

        for (let i = 1; i <= numPages; i++) {
          const { canvas } = await renderPdfPage(doc, i, RENDER_SCALE);

          if (isFirstPage) {
            const ctx = canvas.getContext('2d')!;
            const isLandscapePdf = canvas.width > canvas.height;
            drawStampOnCanvas(ctx, cachetConfig, stampData, canvas.width, canvas.height, isLandscapePdf ? 297 : 210);
            isFirstPage = false;
          }

          addCanvasPage(canvas);
        }
      } else if (isImage(ext)) {
        const img = await loadImage(fileUrl);
        // Respecter l'orientation de l'image source (paysage/portrait)
        const isLandscape = img.width > img.height;
        const canvas = document.createElement('canvas');
        canvas.width = isLandscape ? 2246 : 1588;
        canvas.height = isLandscape ? 1588 : 2246;
        const ctx = canvas.getContext('2d')!;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const marginPx = mmToPx(15, canvas.width, isLandscape ? 297 : 210);
        const availW = canvas.width - marginPx * 2;
        const availH = canvas.height - marginPx * 2;
        const ratio = Math.min(availW / img.width, availH / img.height, 1);
        const drawW = img.width * ratio;
        const drawH = img.height * ratio;
        const drawX = (canvas.width - drawW) / 2;
        const drawY = (canvas.height - drawH) / 2;
        ctx.drawImage(img, drawX, drawY, drawW, drawH);

        if (isFirstPage) {
          const isLandscapeImg = canvas.width > canvas.height;
          drawStampOnCanvas(ctx, cachetConfig, stampData, canvas.width, canvas.height, isLandscapeImg ? 297 : 210);
          isFirstPage = false;
        }

        addCanvasPage(canvas);
      }
      // Les types non supportés (doc, xls, etc.) sont ignorés dans le rendu graphique
    } catch (e) {
      console.warn(`[AR] Impossible de traiter le fichier "${srcFile.nom}":`, e);
    }
  }

  // Si aucun fichier graphique n'a été rendu, créer une page de garde (portrait)
  if (pagesRendered === 0) {
    const coverData = await createCoverPage(courrier, user, annexesCount, cachetConfig);
    pdf.addPage('a4', 'portrait');
    pagesRendered++;
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    pdf.addImage(coverData, 'JPEG', 0, 0, pageW, pageH);
  }

  // QR code si activé (sur la dernière page), positionné selon les dimensions réelles de la page
  if (cachetConfig.afficherQR) {
    const qrUrl = `${window.location.origin}/courriers/${courrier.id}`;
    const qrData = await generateQRDataUrl(qrUrl, 40);
    if (qrData) {
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      pdf.addImage(qrData, 'PNG', pageW - 30, pageH - 25, 20, 20);
    }
  }

  // Supprimer la page blanche initiale créée automatiquement par jsPDF
  if (pdf.getNumberOfPages() > 1) {
    pdf.deletePage(1);
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `AR_${courrier.numero}_${dateStr}.pdf`;
  const blob = await pdf.output('blob') as Blob;
  return new File([blob], fileName, { type: 'application/pdf' });
}
