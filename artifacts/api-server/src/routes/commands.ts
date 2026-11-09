import { Router, type IRouter } from "express";
import { ExecuteCommandBody, ExecuteCommandResponse } from "@workspace/api-zod";
import { currentUser, fail } from "../lib/auth";
import { execute } from "../lib/commands";
const router: IRouter = Router();
router.post("/commands", async (req, res): Promise<void> => {
  const user = await currentUser(req);
  if (!user) fail(401, "Sign in to perform this action");
  const input = ExecuteCommandBody.parse(req.body);
  const result = await execute(user, input);
  res.json(ExecuteCommandResponse.parse(result));
});
export default router;
