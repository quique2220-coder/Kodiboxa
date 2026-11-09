import { Router, type IRouter, type Request } from "express";
import {
  GetCrmResponse, CreateCrmContactBody, CreateCrmContactResponse, UpdateCrmContactBody, UpdateCrmContactParams,
  UpdateCrmContactResponse, SyncCrmContactsResponse, CreateCrmCampaignBody, CreateCrmCampaignResponse,
  UpdateCrmCampaignBody, UpdateCrmCampaignParams, UpdateCrmCampaignResponse, DeleteCrmCampaignParams,
  DeleteCrmCampaignResponse, SendCrmCampaignParams, GetCommunicationPreferencesResponse,
  SaveCommunicationPreferencesBody, SaveCommunicationPreferencesResponse,
  GetCrmIntegrationsResponse, ConnectCrmNeonBody, ConnectCrmNeonResponse, DisconnectCrmNeonResponse,
  SyncCrmNeonResponse, ConnectCrmZapierBody, ConnectCrmZapierResponse, DisconnectCrmZapierResponse,
  TestCrmZapierResponse, SyncCrmZapierResponse,
} from "@workspace/api-zod";
import { currentUser, fail } from "../lib/auth";
import { createContact, updateContact, syncContacts, getPreferences, savePreferences } from "../lib/crm-contacts";
import { getCrmData, saveCampaign, deleteCampaign } from "../lib/crm-campaigns";
import { connectNeon, integrationStatus, disconnect, syncNeon, connectZapier, testZapier, syncZapier } from "../lib/crm-integrations";

async function actor(req: Request, admin = true) {
  const user = await currentUser(req);
  if (!user) fail(401, "Sign in to continue");
  if (admin && user.role !== "admin") fail(403, "The event CRM is available only to administrators");
  return user;
}
const router: IRouter = Router();
router.get("/crm", async (req, res): Promise<void> => {
  await actor(req);
  res.json(GetCrmResponse.parse(await getCrmData()));
});
router.post("/crm/contacts", async (req, res): Promise<void> => {
  const user = await actor(req);
  res.json(CreateCrmContactResponse.parse(await createContact(user, CreateCrmContactBody.parse(req.body))));
});
router.patch("/crm/contacts/:id", async (req, res): Promise<void> => {
  const user = await actor(req), { id } = UpdateCrmContactParams.parse(req.params);
  res.json(UpdateCrmContactResponse.parse(await updateContact(user, id, UpdateCrmContactBody.parse(req.body))));
});
router.post("/crm/sync", async (req, res): Promise<void> => {
  res.json(SyncCrmContactsResponse.parse(await syncContacts(await actor(req))));
});
router.post("/crm/campaigns", async (req, res): Promise<void> => {
  const user = await actor(req);
  res.json(CreateCrmCampaignResponse.parse(await saveCampaign(user, CreateCrmCampaignBody.parse(req.body))));
});
router.patch("/crm/campaigns/:id", async (req, res): Promise<void> => {
  const user = await actor(req), { id } = UpdateCrmCampaignParams.parse(req.params);
  res.json(UpdateCrmCampaignResponse.parse(await saveCampaign(user, UpdateCrmCampaignBody.parse(req.body), id)));
});
router.delete("/crm/campaigns/:id", async (req, res): Promise<void> => {
  const user = await actor(req), { id } = DeleteCrmCampaignParams.parse(req.params);
  res.json(DeleteCrmCampaignResponse.parse(await deleteCampaign(user, id)));
});
router.post("/crm/campaigns/:id/send", async (req, _res): Promise<void> => {
  await actor(req);
  SendCrmCampaignParams.parse(req.params);
  fail(501, "Sending is disabled: connect and configure an email or SMS service first. No messages were sent.");
});
router.get("/communication-preferences", async (req, res): Promise<void> => {
  res.json(GetCommunicationPreferencesResponse.parse(await getPreferences(await actor(req, false))));
});
router.put("/communication-preferences", async (req, res): Promise<void> => {
  const user = await actor(req, false);
  res.json(SaveCommunicationPreferencesResponse.parse(await savePreferences(user, SaveCommunicationPreferencesBody.parse(req.body))));
});
router.get("/crm/integrations", async (req, res): Promise<void> => {
  await actor(req);
  res.json(GetCrmIntegrationsResponse.parse(await integrationStatus()));
});
router.put("/crm/integrations/neon/connect", async (req, res): Promise<void> => {
  res.json(ConnectCrmNeonResponse.parse(await connectNeon(await actor(req), ConnectCrmNeonBody.parse(req.body).connectionString)));
});
router.delete("/crm/integrations/neon", async (req, res): Promise<void> => {
  res.json(DisconnectCrmNeonResponse.parse(await disconnect(await actor(req), "neon")));
});
router.post("/crm/integrations/neon/sync", async (req, res): Promise<void> => {
  res.json(SyncCrmNeonResponse.parse(await syncNeon(await actor(req))));
});
router.put("/crm/integrations/zapier/connect", async (req, res): Promise<void> => {
  res.json(ConnectCrmZapierResponse.parse(await connectZapier(await actor(req), ConnectCrmZapierBody.parse(req.body).url)));
});
router.delete("/crm/integrations/zapier", async (req, res): Promise<void> => {
  res.json(DisconnectCrmZapierResponse.parse(await disconnect(await actor(req), "zapier")));
});
router.post("/crm/integrations/zapier/test", async (req, res): Promise<void> => {
  res.json(TestCrmZapierResponse.parse(await (async () => { await actor(req); return testZapier(); })()));
});
router.post("/crm/integrations/zapier/sync", async (req, res): Promise<void> => {
  res.json(SyncCrmZapierResponse.parse(await syncZapier(await actor(req))));
});
export default router;
