import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { and, asc, eq } from "drizzle-orm";
import sharp, { type Metadata } from "sharp";
import { v7 as uuidv7 } from "uuid";

import { db } from "@/lib/db";
import { routeSnapshotImages, routeSnapshots } from "@/lib/db/schema";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of/types";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);
const ALLOWED_SHARP_FORMATS = new Set(["png", "jpeg"]);

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(os.homedir(), ".jippy-bucket", "bucket");

export type RouteSnapshotImageRecord = {
  id: string;
  snapshotId: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Date;
  publicUrl: string;
};

function extensionFromFilename(filename: string): string | null {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext) ? ext : null;
}

function mimeTypeFromExtension(ext: string): string {
  return ext === ".png" ? "image/png" : "image/jpeg";
}

function publicExtensionFromMimeType(mimeType: string): string {
  return mimeType === "image/png" ? "png" : "jpg";
}

export function buildPublicImageUrl(id: string, mimeType: string): string {
  const ext = publicExtensionFromMimeType(mimeType);
  return `/api/public/images/${id}.${ext}`;
}

function mapImageRecord(record: {
  id: string;
  snapshotId: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Date;
}): RouteSnapshotImageRecord {
  return {
    id: record.id,
    snapshotId: record.snapshotId,
    originalFilename: record.originalFilename,
    fileSize: record.fileSize,
    mimeType: record.mimeType,
    uploadedAt: record.uploadedAt,
    publicUrl: buildPublicImageUrl(record.id, record.mimeType),
  };
}

async function ensureUploadsDir(): Promise<void> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

export async function verifySnapshotBelongsToRoute(
  routeId: string,
  snapshotId: string,
): Promise<Result<{ snapshotId: string }>> {
  const [snapshot] = await db
    .select({ id: routeSnapshots.id })
    .from(routeSnapshots)
    .where(
      and(
        eq(routeSnapshots.id, snapshotId),
        eq(routeSnapshots.routeId, routeId),
      ),
    )
    .limit(1);

  if (!snapshot) {
    return new Failure(ErrorCodes.ResourceNotFound, "No such snapshot found.", { routeId, snapshotId });
  }

  return new Success({ snapshotId: snapshot.id });
}

export async function validateAndSaveImage(
  file: File,
  snapshotId: string,
  uploadedBy: string,
): Promise<Result<RouteSnapshotImageRecord>> {
  try {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return new Failure(ErrorCodes.ValidationFailure, "Image must not exceed 10 MB.", { snapshotId });
    }

    const extension = extensionFromFilename(file.name);
    if (!extension) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Invalid file extension. Allowed extensions: .png, .jpg, .jpeg.",
        { snapshotId, filename: file.name },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let metadata: Metadata;
    try {
      metadata = await sharp(buffer).metadata();
    } catch {
      return new Failure(ErrorCodes.ValidationFailure, "Invalid image file.", { snapshotId, filename: file.name });
    }

    if (!metadata.format || !ALLOWED_SHARP_FORMATS.has(metadata.format)) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Invalid image format. Allowed formats: PNG, JPG.",
        { snapshotId, filename: file.name },
      );
    }

    const mimeType = mimeTypeFromExtension(extension);
    const id = uuidv7();
    const storedExt = extension.slice(1);
    const storedFilename = `${id}.${storedExt}`;

    await ensureUploadsDir();
    await fs.writeFile(path.join(UPLOADS_DIR, storedFilename), buffer);

    const [inserted] = await db
      .insert(routeSnapshotImages)
      .values({
        id,
        snapshotId,
        originalFilename: file.name,
        storedFilename,
        fileSize: buffer.length,
        mimeType,
        uploadedBy,
      })
      .returning();

    if (!inserted) {
      await fs.unlink(path.join(UPLOADS_DIR, storedFilename)).catch(() => undefined);
      return new Failure(ErrorCodes.Fatal, "Failed to save image metadata.", { snapshotId });
    }

    return new Success(mapImageRecord(inserted));
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Failed to upload image.", { snapshotId }, error);
  }
}

export async function getSnapshotImages(snapshotId: string): Promise<Result<RouteSnapshotImageRecord[]>> {
  try {
    const records = await db
      .select()
      .from(routeSnapshotImages)
      .where(eq(routeSnapshotImages.snapshotId, snapshotId))
      .orderBy(asc(routeSnapshotImages.uploadedAt));

    return new Success(records.map(mapImageRecord));
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch snapshot images.", { snapshotId }, error);
  }
}

export async function deleteImage(
  routeId: string,
  snapshotId: string,
  imageId: string,
): Promise<Result<undefined>> {
  try {
    const snapshotResult = await verifySnapshotBelongsToRoute(routeId, snapshotId);
    if (snapshotResult instanceof Failure) {
      return snapshotResult;
    }

    const [record] = await db
      .select()
      .from(routeSnapshotImages)
      .where(
        and(
          eq(routeSnapshotImages.id, imageId),
          eq(routeSnapshotImages.snapshotId, snapshotId),
        ),
      )
      .limit(1);

    if (!record) {
      return new Failure(ErrorCodes.ResourceNotFound, "Image not found.", { routeId, snapshotId, imageId });
    }

    await db.delete(routeSnapshotImages).where(eq(routeSnapshotImages.id, imageId));
    await fs.unlink(path.join(UPLOADS_DIR, record.storedFilename)).catch(() => undefined);

    return new Success(undefined);
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Failed to delete image.", { routeId, snapshotId, imageId }, error);
  }
}

export async function copyImagesForSnapshot(
  sourceSnapshotId: string,
  newSnapshotId: string,
  ownerId: string,
): Promise<Result<undefined>> {
  try {
    const images = await db
      .select()
      .from(routeSnapshotImages)
      .where(eq(routeSnapshotImages.snapshotId, sourceSnapshotId));

    if (images.length === 0) {
      return new Success(undefined);
    }

    await ensureUploadsDir();

    for (const image of images) {
      const newId = uuidv7();
      const storedExt = path.extname(image.storedFilename).slice(1);
      const newStoredFilename = `${newId}.${storedExt}`;
      const sourcePath = path.join(UPLOADS_DIR, image.storedFilename);
      const destinationPath = path.join(UPLOADS_DIR, newStoredFilename);

      await fs.copyFile(sourcePath, destinationPath);

      await db.insert(routeSnapshotImages).values({
        id: newId,
        snapshotId: newSnapshotId,
        originalFilename: image.originalFilename,
        storedFilename: newStoredFilename,
        fileSize: image.fileSize,
        mimeType: image.mimeType,
        uploadedBy: ownerId,
      });
    }

    return new Success(undefined);
  } catch (error) {
    return new Failure(
      ErrorCodes.Fatal,
      "Failed to copy snapshot images.",
      { sourceSnapshotId, newSnapshotId },
      error,
    );
  }
}

export async function serveImage(imageId: string): Promise<Result<{ buffer: Buffer; mimeType: string }>> {
  try {
    const [record] = await db
      .select()
      .from(routeSnapshotImages)
      .where(eq(routeSnapshotImages.id, imageId))
      .limit(1);

    if (!record) {
      return new Failure(ErrorCodes.ResourceNotFound, "Image not found.", { imageId });
    }

    const buffer = await fs.readFile(path.join(UPLOADS_DIR, record.storedFilename));
    return new Success({ buffer, mimeType: record.mimeType });
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Failed to serve image.", { imageId }, error);
  }
}

export function parseImageIdFromParam(imageIdParam: string): string {
  return imageIdParam.replace(/\.(png|jpe?g)$/i, "");
}
