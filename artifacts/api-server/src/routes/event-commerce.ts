import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { db, mediaUploads } from "@workspace/db";
import { and, eq, or } from "drizzle-orm";
import { StartEventCheckoutBody, RequestUploadUrlBody, CompleteUploadBody } from "@workspace/api-zod";
import { currentUser, fail } from "../lib/auth";
import { startCheckout, cancelCheckout } from "../lib/ticketing";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();
router.post("/ticket-checkout", async (req, res) => {
  const user = await currentUser(req);
  if (!user) fail(401, "Sign in before purchasing admission");
  res.json(await startCheckout(user, StartEventCheckoutBody.parse(req.body)));
});
router.post("/ticket-checkout/:id/cancel", async (req, res) => {
  const user = await currentUser(req);
  if (!user) fail(401, "Sign in before cancelling checkout");
  res.json(await cancelCheckout(user, String(req.params.id)));
});
router.post("/storage/uploads/request-url", async (req, res) => {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") fail(403, "Administrator access is required to upload event images");
  const data = RequestUploadUrlBody.parse(req.body);
  const uploadURL = await storage.getObjectEntityUploadURL();
  const objectPath = storage.normalizeObjectEntityPath(uploadURL);
  await db.insert(mediaUploads).values({ id: randomUUID(), ownerId: user.id, objectPath, size: data.size });
  res.json({ uploadURL, objectPath });
});
router.post("/storage/uploads/complete", async (req, res) => {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") fail(403, "Administrator access is required to publish event images");
  const { objectPath } = CompleteUploadBody.parse(req.body);
  const [upload] = await db.select().from(mediaUploads).where(and(eq(mediaUploads.ownerId, user.id), or(eq(mediaUploads.objectPath, objectPath), eq(mediaUploads.objectPath, `${objectPath}-published`))));
  if (!upload) fail(404, "Upload not found");
  if (upload.status === "ready") { res.json({ objectPath: upload.objectPath }); return; }
  const file = await storage.getObjectEntityFile(objectPath);
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) !== upload.size || Number(metadata.size) > 2097152) fail(400, "PNG image must be no larger than 2 MB and match the declared upload size");
  const source = file.bucket.file(file.name, { generation: metadata.generation });
  const [header] = await source.download({ start: 0, end: 31 });
  if (header.length < 24 || !header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || header.toString("ascii", 12, 16) !== "IHDR") fail(400, "The uploaded file is not a PNG image");
  const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
  if (!width || !height || width > 4096 || height > 4096) fail(400, "PNG dimensions must be between 1 and 4096 pixels");
  // Publish an immutable copy, not the still-writable presigned upload target.
  const destination = file.bucket.file(`${file.name}-published`);
  const [publishedExists] = await destination.exists();
  if (!publishedExists) await source.copy(destination, { preconditionOpts: { ifGenerationMatch: 0 } });
  await destination.setMetadata({ contentType: "image/png", cacheControl: "public,max-age=86400,immutable" });
  const publishedPath = `${objectPath}-published`;
  await storage.trySetObjectEntityAclPolicy(publishedPath, { owner: user.id, visibility: "public" });
  await db.update(mediaUploads).set({ status: "ready", objectPath: publishedPath }).where(eq(mediaUploads.id, upload.id));
  await file.delete({ ignoreNotFound: true });
  res.json({ objectPath: publishedPath });
});
router.get("/storage/objects/*objectPath", async (req, res) => {
  const segments = req.params.objectPath;
  const path = `/objects/${Array.isArray(segments) ? segments.join("/") : segments}`;
  const [asset] = await db.select().from(mediaUploads).where(and(eq(mediaUploads.objectPath, path), eq(mediaUploads.status, "ready")));
  if (!asset) fail(404, "Image not found");
  const file = await storage.getObjectEntityFile(path);
  res.set({ "Content-Type": "image/png", "Cache-Control": "public,max-age=86400,immutable", "X-Content-Type-Options": "nosniff" });
  file.createReadStream().on("error", error => res.destroy(error)).pipe(res);
});
export default router;
