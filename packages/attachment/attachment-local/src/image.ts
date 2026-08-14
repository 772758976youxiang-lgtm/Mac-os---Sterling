/** Raster inspection: full decode at admission, header-only probe on verified reads. */

import sharp, { type Sharp } from 'sharp'
import { AttachmentError } from '@deepseek-ai/dsh-attachment'
import type { ImageMediaType } from '@deepseek-ai/dsh-attachment'

/** Decoded metadata from a supported image. */
export interface DetectedImage {
  mediaType: ImageMediaType
  width: number
  height: number
}

const MEDIA_TYPES: Readonly<Record<string, ImageMediaType>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  heif: 'image/heif',
}

/** Formats decoded locally but normalized before becoming durable references. */
function requiresNormalization(mediaType: ImageMediaType): boolean {
  return mediaType === 'image/avif' || mediaType === 'image/heif'
}

/** libvips reports both AVIF and HEIF containers as `heif`; both normalize. */
function matchesDeclaredType(detected: ImageMediaType, declared: ImageMediaType): boolean {
  return detected === declared || (detected === 'image/heif' && declared === 'image/avif')
}

async function imageMetadata(image: Sharp): Promise<DetectedImage> {
  const metadata = await image.metadata()
  const mediaType = MEDIA_TYPES[metadata.format as string]
  if (mediaType === undefined) {
    throw new AttachmentError('Unsupported or malformed image data.', 'INVALID_IMAGE')
  }
  return { mediaType, width: metadata.width, height: metadata.height }
}

/**
 * Parse a supported raster's header and return its intrinsic metadata without
 * decoding pixels. Digest-verified reads use this: admission already proved
 * that these exact bytes decode completely, so the read path only re-derives
 * the reference fields instead of paying the full-raster decode again.
 * @param data - complete encoded image bytes.
 * @returns verified format and dimensions.
 */
export async function probeImage(data: Uint8Array): Promise<DetectedImage> {
  try {
    return await imageMetadata(sharp(data, { failOn: 'error', limitInputPixels: false }))
  } catch (error) {
    if (error instanceof AttachmentError) throw error
    throw new AttachmentError('Unsupported or malformed image data.', 'INVALID_IMAGE', { cause: error })
  }
}

/**
 * Fully decode a supported raster and return its intrinsic metadata.
 * @param data - complete encoded image bytes.
 * @param maxPixels - decoded-pixel admission limit.
 * @returns verified format and dimensions.
 */
export async function detectImage(data: Uint8Array, maxPixels?: number): Promise<DetectedImage> {
  try {
    const image = sharp(data, { failOn: 'error', limitInputPixels: false })
    const detected = await imageMetadata(image)
    if (maxPixels !== undefined && detected.width * detected.height > maxPixels) {
      throw new AttachmentError('Image exceeds the configured decoded-pixel limit.', 'IMAGE_TOO_MANY_PIXELS')
    }
    await image.raw().toBuffer()
    return detected
  } catch (error) {
    if (error instanceof AttachmentError) throw error
    throw new AttachmentError('Unsupported or malformed image data.', 'INVALID_IMAGE', { cause: error })
  }
}

/**
 * Decode a browser-friendly raster and convert formats not accepted by image
 * APIs to JPEG before they enter durable model context.
 * @param data - complete encoded image bytes.
 * @param declaredMediaType - browser-declared, canonicalized media type.
 * @param maxPixels - decoded-pixel admission limit.
 * @returns source metadata plus the canonical bytes and metadata to store.
 */
export async function normalizeImage(
  data: Uint8Array,
  declaredMediaType: ImageMediaType,
  maxPixels?: number,
): Promise<{ data: Uint8Array; detected: DetectedImage; stored: DetectedImage }> {
  const detected = await detectImage(data, maxPixels)
  if (!matchesDeclaredType(detected.mediaType, declaredMediaType)) {
    throw new AttachmentError('Declared image type does not match its bytes.', 'IMAGE_TYPE_MISMATCH')
  }
  if (!requiresNormalization(detected.mediaType)) return { data, detected, stored: detected }
  try {
    // HEIC/HEIF and AVIF are common browser upload formats but are not a
    // portable Image API edit input. Flatten preserves a deterministic result
    // for AVIF alpha before encoding a universally accepted JPEG reference.
    const normalized = new Uint8Array(await sharp(data, { failOn: 'error', limitInputPixels: false })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer())
    return { data: normalized, detected, stored: await detectImage(normalized, maxPixels) }
  } catch (error) {
    if (error instanceof AttachmentError) throw error
    throw new AttachmentError('Unsupported or malformed image data.', 'INVALID_IMAGE', { cause: error })
  }
}
