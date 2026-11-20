import { Hono } from "hono";
import { z } from "zod/v3";
import { ModelProviderTestRequest, ModelProviderTestResponse, type ModelProviderConfig } from "@scarlet/shared";
import type { AppEnv } from "../auth.js";
import type { Ctx } from "../context.js";
import { badRequest } from "../errors.js";
import { availableTranscriptionProvider, transcriptionProviderIssue } from "../transcribe/index.js";
import { localRuntimeStatus, resolveLocalRuntime, localRuntimeIssue } from "../transcribe/localRuntime.js";
import { jsonBody } from "./util.js";

/** Why nothing can transcribe, in the editor's words, so Media can say it and offer the fix. */
async function transcriptionIssue(ctx: Ctx): Promise<string> {
  if (ctx.settings().transcription.provider === "none") {
    return await localRuntimeIssue(resolveLocalRuntime(ctx, { ...ctx.settings().transcription, provider: "whispercpp" }))
      ?? "Local transcription is unavailable.";
  }
  return transcriptionProviderIssue(ctx);
}

export function settingsRoutes(ctx: Ctx) {
  const r = new Hono<AppEnv>();

  r.get("/settings", async (c) => {
    const settings = ctx.settings();
    const safeSettings = { ...settings, modelProviders: settings.modelProviders.map(({ apiKey: _apiKey, ...provider }) => provider) };
    const transcriptionAvailable = !!await availableTranscriptionProvider(ctx);
    return c.json({ settings: safeSettings, transcriptionAvailable, telemetryUnavailable: ctx.telemetry.unavailable,
      ...!transcriptionAvailable && { transcriptionIssue: await transcriptionIssue(ctx) } });
  });

  r.post("/settings/model-providers/test", async (c) => {
    const body = await jsonBody(c, ModelProviderTestRequest);
    const configured = body.providerId ? ctx.repos.settings.provider(body.providerId) : undefined;
    const provider: ModelProviderConfig | undefined = configured ? { ...configured, ...body, apiKey: body.apiKey ?? configured.apiKey } : body as ModelProviderConfig;
    if (!provider?.baseUrl || !provider.model || !provider.apiKey) {
      return c.json(ModelProviderTestResponse.parse({ ok: false, providerId: provider?.id, model: provider?.model, error: "provider baseUrl, model and API key are required" }), 400);
    }
    try {
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${provider.apiKey}` },
        body: JSON.stringify({ model: provider.model, messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return c.json({ ok: false, providerId: provider.id, model: provider.model, error: response.status === 401 ? "authentication failed" : `provider returned HTTP ${response.status}` }, 502);
      return c.json({ ok: true, providerId: provider.id, model: provider.model });
    } catch (error) {
      return c.json({ ok: false, providerId: provider.id, model: provider.model, error: error instanceof DOMException && error.name === "TimeoutError" ? "connection timed out" : "connection failed" }, 502);
    }
  });

  r.get("/settings/model-providers", c => c.json({ providers: ctx.settings().modelProviders.map(({ apiKey: _apiKey, ...provider }) => provider) }));

  r.get("/settings/local-model", async (c) => c.json(await localRuntimeStatus(ctx)));

  r.patch("/settings", async (c) => {
    const patch = await jsonBody(c, z.record(z.unknown()));
    if (Array.isArray(patch.modelProviders)) {
      const previous = new Map(ctx.settings().modelProviders.map(provider => [provider.id, provider]));
      patch.modelProviders = patch.modelProviders.map(item => item && typeof item === "object" && previous.has(String((item as Record<string, unknown>).id)) && !Object.hasOwn(item, "apiKey")
        ? { ...(item as Record<string, unknown>), apiKey: previous.get(String((item as Record<string, unknown>).id))?.apiKey } : item);
    }
    if ("dialogue" in patch) throw badRequest("dialogue_settings_moved", "Edit the Dialogue pass skill to change dialogue preferences.");
    const previous = ctx.settings().render;
    const settings = ctx.repos.settings.update(patch);
    ctx.telemetry.refreshPreference();
    if (previous.hwaccel !== settings.render.hwaccel || previous.previewHeight !== settings.render.previewHeight) {
      ctx.bus.publish({ type: "render.settings.updated" });
    }
    const safeSettings = { ...settings, modelProviders: settings.modelProviders.map(({ apiKey: _apiKey, ...provider }) => provider) };
    return c.json({ settings: safeSettings });
  });

  return r;
}
