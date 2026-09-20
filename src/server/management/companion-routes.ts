import {
  applyCompanionSettingsPatch,
  DEFAULT_COMPANION_SETTINGS,
  loadCompanionSettings,
  saveCompanionSettings,
} from "../../companion/settings";
import { jsonResponse } from "../auth-cors";
import { readManagementJsonBody, rethrowManagementBodyTooLarge } from "./body";
import type { ManagementContext } from "./context";

let companionLastSeenAt: number | null = null;

export function resetCompanionPresenceForTests(): void {
  companionLastSeenAt = null;
}

function response(): Response {
  const loaded = loadCompanionSettings();
  return jsonResponse({
    settings: loaded.settings,
    updatedAt: loaded.updatedAt,
    defaults: DEFAULT_COMPANION_SETTINGS,
    companion: { lastSeenAt: companionLastSeenAt },
    ...(loaded.corrupt ? { corrupt: true } : {}),
  });
}

export async function handleCompanionRoutes(ctx: ManagementContext): Promise<Response | null> {
  if (ctx.url.pathname === "/api/companion/settings" && ctx.req.method === "GET") {
    if (ctx.req.headers.get("user-agent")?.startsWith("OpenCodexMenuBar/")) companionLastSeenAt = Date.now();
    return response();
  }
  if (ctx.url.pathname !== "/api/companion/settings" || ctx.req.method !== "PUT") return null;
  let body: unknown;
  try {
    body = await readManagementJsonBody(ctx.req);
  } catch (error) {
    rethrowManagementBodyTooLarge(error);
    return jsonResponse({ error: "invalid JSON body" }, 400, ctx.req, ctx.config);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonResponse({ error: "invalid settings body" }, 400, ctx.req, ctx.config);
  const input = body as { reset?: unknown; settings?: unknown };
  if (input.reset === true) {
    saveCompanionSettings(DEFAULT_COMPANION_SETTINGS);
    return response();
  }
  if (!("settings" in input)) return jsonResponse({ error: "provide settings or reset:true" }, 400, ctx.req, ctx.config);
  const current = loadCompanionSettings().settings;
  const updated = applyCompanionSettingsPatch(current, input.settings);
  if ("error" in updated) return jsonResponse(updated, 400, ctx.req, ctx.config);
  saveCompanionSettings(updated);
  return response();
}
