import { Injectable } from '@angular/core';

/** Risultato della compressione immagine. */
export interface CompressedImage {
  /** Data URL completo: "data:image/jpeg;base64,..." — usabile direttamente in <img [src]>. */
  data: string;
  mimeType: 'image/jpeg';
  /** Dimensione approssimata in KB: data.length * 0.75 / 1024. */
  sizeKB: number;
}

/** Tipi di input accettati. HEIC/HEIF: supportati su Safari iOS, non su Chrome (fallback esplicito). */
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/** Dimensione massima del lato lungo in pixel dopo resize. */
const MAX_SIDE_PX = 1024;

/** Qualità JPEG al primo tentativo. */
const QUALITY_HIGH = 0.7;

/** Qualità JPEG al secondo tentativo (retry automatico se >200KB). */
const QUALITY_LOW = 0.5;

/** Soglia massima in KB per il risultato finale. */
const MAX_SIZE_KB = 200;

/**
 * Servizio per la compressione di immagini lato client.
 * Usa canvas + FileReader nativi — nessuna dipendenza npm aggiuntiva.
 *
 * Pipeline:
 *  1. Legge il file con FileReader come Data URL.
 *  2. Carica in HTMLImageElement.
 *  3. Ridimensiona su canvas (max 1024px lato lungo, preserva aspect ratio).
 *  4. Esporta come JPEG qualità 0.7.
 *  5. Se risultato >200KB, riprova con qualità 0.5.
 *  6. Se ancora >200KB, lancia errore.
 *
 * Note HEIC: Safari iOS decodifica HEIC nativamente tramite img.src → la canvas pipeline
 * funziona. Chrome non supporta HEIC: FileReader riesce ma img.onload non si attiva →
 * errore esplicito "HEIC non supportato su questo browser".
 */
@Injectable({ providedIn: 'root' })
export class ImageProcessorService {

  /**
   * Comprime un file immagine e ritorna un oggetto CompressedImage.
   *
   * @param file File immagine (jpg/png/webp/heic/heif).
   * @throws Error con messaggio leggibile in caso di formato non supportato,
   *         immagine non decodificabile o risultato >200KB anche dopo retry.
   */
  compressImage(file: File): Promise<CompressedImage> {
    return new Promise((resolve, reject) => {
      // Valida il tipo MIME
      if (!ACCEPTED_TYPES.includes(file.type)) {
        reject(new Error('FORMAT_UNSUPPORTED'));
        return;
      }

      const reader = new FileReader();

      reader.onerror = () => reject(new Error('FORMAT_UNSUPPORTED'));

      reader.onload = (readerEvent) => {
        const srcDataUrl = readerEvent.target?.result as string;
        if (!srcDataUrl) {
          reject(new Error('FORMAT_UNSUPPORTED'));
          return;
        }

        const img = new Image();

        // Timeout: se l'immagine non si carica in 15s, probabilmente HEIC su Chrome.
        const loadTimeout = setTimeout(() => {
          reject(new Error('HEIC_UNSUPPORTED'));
        }, 15000);

        img.onerror = () => {
          clearTimeout(loadTimeout);
          // HEIC su Chrome: FileReader non lancia errore ma img.onerror scatta.
          if (file.type === 'image/heic' || file.type === 'image/heif') {
            reject(new Error('HEIC_UNSUPPORTED'));
          } else {
            reject(new Error('FORMAT_UNSUPPORTED'));
          }
        };

        img.onload = () => {
          clearTimeout(loadTimeout);
          try {
            const result = this.compressWithCanvas(img, QUALITY_HIGH);
            if (result.sizeKB <= MAX_SIZE_KB) {
              resolve(result);
              return;
            }
            // Primo retry: qualità ridotta
            const retry = this.compressWithCanvas(img, QUALITY_LOW);
            if (retry.sizeKB <= MAX_SIZE_KB) {
              resolve(retry);
              return;
            }
            // Ancora troppo grande: errore
            reject(new Error('TOO_LARGE'));
          } catch (e) {
            reject(new Error('FORMAT_UNSUPPORTED'));
          }
        };

        img.src = srcDataUrl;
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * Ridimensiona l'immagine su canvas e la serializza come JPEG.
   * Non modifica l'immagine sorgente.
   */
  private compressWithCanvas(img: HTMLImageElement, quality: number): CompressedImage {
    const { width, height } = this.computeTargetSize(img.naturalWidth, img.naturalHeight);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    // Approssima KB: ogni char base64 ≈ 0.75 byte
    const sizeKB = (dataUrl.length * 0.75) / 1024;

    return {
      data: dataUrl,
      mimeType: 'image/jpeg',
      sizeKB,
    };
  }

  /**
   * Calcola le dimensioni di output rispettando il vincolo MAX_SIDE_PX
   * e preservando l'aspect ratio. Nessun upscaling.
   */
  private computeTargetSize(
    srcW: number,
    srcH: number
  ): { width: number; height: number } {
    if (srcW <= MAX_SIDE_PX && srcH <= MAX_SIDE_PX) {
      return { width: srcW, height: srcH };
    }
    if (srcW >= srcH) {
      return {
        width: MAX_SIDE_PX,
        height: Math.round((srcH / srcW) * MAX_SIDE_PX),
      };
    }
    return {
      width: Math.round((srcW / srcH) * MAX_SIDE_PX),
      height: MAX_SIDE_PX,
    };
  }
}
