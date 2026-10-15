import exifr from "exifr";

/**
 * Devuelve la fecha en que se TOMÓ/creó la foto (metadatos EXIF), no la de subida.
 * Prioriza DateTimeOriginal (captura) y usa la fecha del archivo como respaldo.
 * Debe leerse del archivo ORIGINAL (antes de comprimir, que borra el EXIF).
 */
export async function getPhotoDate(file: File): Promise<number> {
  try {
    const data = await exifr.parse(file, ["DateTimeOriginal", "CreateDate", "ModifyDate"]);
    const d: Date | undefined = data?.DateTimeOriginal || data?.CreateDate || data?.ModifyDate;
    if (d instanceof Date && !isNaN(d.getTime())) return d.getTime();
  } catch {
    /* sin EXIF: usamos la fecha del archivo */
  }
  return file.lastModified || Date.now();
}

// Redimensiona y comprime una imagen en el navegador antes de subirla a la nube,
// así ocupa poco, sube rápido y se ve fluido en cualquier dispositivo.
export async function compressImage(file: File, maxSize = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    let { width, height } = img;
    if (Math.max(width, height) > maxSize) {
      const scale = maxSize / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // si algo falla, subimos el original
  }
}
