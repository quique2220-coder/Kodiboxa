import { Router, type IRouter } from "express";
import { GetRoomOperationsQueryParams, GetRoomOperationsResponse, GetRoomEntryParams, GetRoomEntryResponse } from "@workspace/api-zod";
import { currentUser, fail } from "../lib/auth";
import { roomOperations, roomEntry } from "../lib/room-reporting";

const router: IRouter = Router();
router.get("/room-operations", async (req, res): Promise<void> => {
  const user = await currentUser(req);
  if (!user) fail(401, "Sign in to access room operations");
  if (user.role !== "admin") fail(403, "Room operations is available only to administrators");
  const { eventId } = GetRoomOperationsQueryParams.parse(req.query);
  res.json(GetRoomOperationsResponse.parse(await roomOperations(eventId)));
});
router.get("/rooms/:id/entry", async (req, res): Promise<void> => {
  const user = await currentUser(req);
  if (!user) fail(401, "Sign in to check into a room");
  const { id } = GetRoomEntryParams.parse(req.params);
  res.json(GetRoomEntryResponse.parse(await roomEntry(id, user)));
});
export default router;
