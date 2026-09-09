const SERVER_SAFE_BYTES = 3 * 1024 * 1024;
const MAX_SOURCE_BYTES = 60 * 1024 * 1024;
const PASSTHROUGH_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Safari can decode some iPhone formats through an HTML image even when
      // createImageBitmap does not support them.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(new Error("El formato de la imagen no es compatible."));
  }).catch((error) => {
    URL.revokeObjectURL(objectUrl);
    throw error;
  });
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    release: () => URL.revokeObjectURL(objectUrl),
  };
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("No pudimos preparar la imagen.")),
      "image/jpeg",
      quality,
    );
  });
}

export async function prepareImageForUpload(
  file: File,
  options: { maxBytes?: number; maxDimension?: number } = {},
) {
  const maxBytes = options.maxBytes ?? SERVER_SAFE_BYTES;
  const maxDimension = options.maxDimension ?? 4096;
  if (file.size > MAX_SOURCE_BYTES)
    throw new Error(`${file.name} supera el máximo de 60 MB.`);
  if (file.size <= maxBytes && PASSTHROUGH_TYPES.has(file.type)) return file;

  const decoded = await decodeImage(file);
  try {
    if (!decoded.width || !decoded.height)
      throw new Error(`No pudimos leer ${file.name}.`);
    const scale = Math.min(
      1,
      maxDimension / Math.max(decoded.width, decoded.height),
    );
    let width = Math.max(1, Math.round(decoded.width * scale));
    let height = Math.max(1, Math.round(decoded.height * scale));
    let best: Blob | null = null;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (attempt > 0 && attempt % 4 === 0) {
        width = Math.max(1200, Math.round(width * 0.82));
        height = Math.max(1200, Math.round(height * 0.82));
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Tu navegador no pudo preparar la imagen.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(decoded.source, 0, 0, width, height);
      const quality = Math.max(0.62, 0.9 - (attempt % 4) * 0.08);
      best = await canvasBlob(canvas, quality);
      canvas.width = 1;
      canvas.height = 1;
      if (best.size <= maxBytes) break;
    }

    if (!best || best.size > maxBytes)
      throw new Error(`No pudimos reducir ${file.name} a un tamaño seguro.`);
    const baseName = file.name.replace(/\.[^.]+$/, "") || "foto";
    return new File([best], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    decoded.release();
  }
}

export async function readJsonResponse<T extends { error?: string }>(
  response: Response,
): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {
      error: response.ok
        ? "La respuesta del servidor no fue válida."
        : "La imagen no llegó al servidor. Intenta nuevamente.",
    } as T;
  }
}
