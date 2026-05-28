/**
 * DiepXuan Custom Usage Fetchers
 * Contains usage logic for providers specific to the DiepXuan fork.
 */

import { proxyAwareFetch } from "../../utils/proxyFetch.js";

// GLM quota endpoints (region-aware)
const GLM_QUOTA_URLS = {
  international: "https://api.z.ai/api/monitor/usage/quota/limit",
  china: "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
};

// MiniMax usage endpoints (try in order, fallback on transient errors)
const MINIMAX_USAGE_URLS = {
  minimax: [
    "https://www.minimax.io/v1/token_plan/remains",
    "https://api.minimax.io/v1/api/openplatform/coding_plan/remains",
  ],
  "minimax-cn": [
    "https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains",
    "https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains",
  ],
};

/**
 * GLM Coding Plan usage (international + China regions)
 */
export async function getGlmUsage(apiKey, provider, proxyOptions = null) {
  if (!apiKey) {
    return { message: "GLM API key not available." };
  }

  const region = provider === "glm-cn" ? "china" : "international";
  const quotaUrl = GLM_QUOTA_URLS[region];

  try {
    const response = await proxyAwareFetch(quotaUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    }, proxyOptions);

    if (!response.ok) {
      if (response.status === 401) {
        return { message: "GLM API key invalid or expired." };
      }
      return { message: `GLM quota API error (${response.status}).` };
    }

    const json = await response.json();
    const data = json?.data && typeof json.data === "object" ? json.data : {};
    const limits = Array.isArray(data.limits) ? data.limits : [];
    const quotas = {};

    for (const limit of limits) {
      if (!limit || limit.type !== "TOKENS_LIMIT") continue;
      const usedPercent = Number(limit.percentage) || 0;
      const resetMs = Number(limit.nextResetTime) || 0;
      const remaining = Math.max(0, 100 - usedPercent);

      quotas["session"] = {
        used: usedPercent,
        total: 100,
        remaining,
        remainingPercentage: remaining,
        resetAt: resetMs > 0 ? new Date(resetMs).toISOString() : null,
        unlimited: false,
      };
    }

    const levelRaw = typeof data.level === "string" ? data.level : "";
    const plan = levelRaw
      ? levelRaw.charAt(0).toUpperCase() + levelRaw.slice(1).toLowerCase()
      : "Unknown";

    return { plan, quotas };
  } catch (error) {
    return { message: `GLM error: ${error.message}` };
  }
}

// ── MiniMax helpers ──────────────────────────────────────────────────────
function getMiniMaxField(model, snakeKey, camelKey) {
  if (!model || typeof model !== "object") return null;
  return model[snakeKey] ?? model[camelKey] ?? null;
}

function getMiniMaxModelName(model) {
  return String(getMiniMaxField(model, "model_name", "modelName") || "").trim();
}

function formatMiniMaxQuotaName(model) {
  const rawName = getMiniMaxModelName(model);
  if (!rawName) return "MiniMax";

  return rawName
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .replace(/\bTo\b/g, "to")
    .replace(/\bTts\b/g, "TTS")
    .replace(/\bHd\b/g, "HD");
}

function getMiniMaxSessionTotal(model) {
  return Math.max(0, Number(getMiniMaxField(model, "current_interval_total_count", "currentIntervalTotalCount")) || 0);
}

function getMiniMaxWeeklyTotal(model) {
  return Math.max(0, Number(getMiniMaxField(model, "current_weekly_total_count", "currentWeeklyTotalCount")) || 0);
}

function hasMiniMaxQuota(model) {
  return getMiniMaxSessionTotal(model) > 0 || getMiniMaxWeeklyTotal(model) > 0;
}

function getMiniMaxResetAt(model, capturedAtMs, remainsSnake, remainsCamel, endSnake, endCamel) {
  const remainsMs = Number(getMiniMaxField(model, remainsSnake, remainsCamel)) || 0;
  if (remainsMs > 0) return new Date(capturedAtMs + remainsMs).toISOString();
  // Fallback to parseResetTime if available in scope, else null
  const resetTime = getMiniMaxField(model, endSnake, endCamel);
  if (!resetTime) return null;
  if (typeof resetTime === 'number') return new Date(resetTime < 1e12 ? resetTime * 1000 : resetTime).toISOString();
  if (typeof resetTime === 'string') return new Date(resetTime).toISOString();
  return null;
}

function buildMiniMaxQuota(total, count, resetAt, countMeansRemaining) {
  const safeTotal = Math.max(0, total);
  const used = countMeansRemaining ? Math.max(safeTotal - count, 0) : Math.min(Math.max(0, count), safeTotal);
  const remaining = Math.max(safeTotal - used, 0);
  return {
    used,
    total: safeTotal,
    remaining,
    remainingPercentage: safeTotal > 0 ? Math.max(0, Math.min(100, (remaining / safeTotal) * 100)) : 0,
    resetAt,
    unlimited: false,
  };
}

function addMiniMaxQuota(quotas, key, model, getTotal, countSnake, countCamel, resetArgs, countMeansRemaining) {
  const total = getTotal(model);
  if (total <= 0) return;

  const count = Math.max(0, Number(getMiniMaxField(model, countSnake, countCamel)) || 0);
  quotas[key] = buildMiniMaxQuota(
    total,
    count,
    getMiniMaxResetAt(model, ...resetArgs),
    countMeansRemaining
  );
}

/**
 * MiniMax Token Plan / Coding Plan usage
 */
export async function getMiniMaxUsage(apiKey, provider, proxyOptions = null) {
  if (!apiKey) {
    return { message: "MiniMax API key not available." };
  }

  const usageUrls = MINIMAX_USAGE_URLS[provider] || [];
  let lastErrorMessage = "";

  for (let index = 0; index < usageUrls.length; index += 1) {
    const usageUrl = usageUrls[index];
    const canFallback = index < usageUrls.length - 1;

    try {
      const response = await proxyAwareFetch(usageUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }, proxyOptions);

      const rawText = await response.text();
      let payload = {};
      if (rawText) {
        try { payload = JSON.parse(rawText); } catch { payload = {}; }
      }

      const baseResp = (payload?.base_resp ?? payload?.baseResp) || {};
      const apiStatusCode = Number(baseResp.status_code ?? baseResp.statusCode) || 0;
      const apiStatusMessage = String(baseResp.status_msg ?? baseResp.statusMsg ?? "").trim();
      const combined = `${apiStatusMessage} ${rawText}`.trim();
      const authLike = /token plan|coding plan|invalid api key|invalid key|unauthorized|inactive/i;

      if (response.status === 401 || response.status === 403 || apiStatusCode === 1004 || authLike.test(combined)) {
        return { message: "MiniMax API key invalid or inactive. Use an active Token/Coding Plan key." };
      }

      if (!response.ok) {
        lastErrorMessage = `MiniMax usage endpoint error (${response.status})`;
        if ((response.status === 404 || response.status === 405 || response.status >= 500) && canFallback) continue;
        return { message: `MiniMax connected. ${lastErrorMessage}` };
      }

      if (apiStatusCode !== 0) {
        return { message: `MiniMax connected. ${apiStatusMessage || "Upstream quota API error"}` };
      }

      const modelRemains = payload?.model_remains ?? payload?.modelRemains;
      const allModels = Array.isArray(modelRemains) ? modelRemains : [];
      const quotaModels = allModels.filter(hasMiniMaxQuota);

      if (quotaModels.length === 0) {
        return { message: "MiniMax connected. No quota data was returned." };
      }

      const capturedAtMs = Date.now();
      const countMeansRemaining = usageUrl.includes("/coding_plan/remains");
      const quotas = {};

      for (const model of quotaModels) {
        const displayName = formatMiniMaxQuotaName(model);
        addMiniMaxQuota(
          quotas,
          `${displayName} (5h)`,
          model,
          getMiniMaxSessionTotal,
          "current_interval_usage_count",
          "currentIntervalUsageCount",
          [capturedAtMs, "remains_time", "remainsTime", "end_time", "endTime"],
          countMeansRemaining
        );

        addMiniMaxQuota(
          quotas,
          `${displayName} (7d)`,
          model,
          getMiniMaxWeeklyTotal,
          "current_weekly_usage_count",
          "currentWeeklyUsageCount",
          [capturedAtMs, "weekly_remains_time", "weeklyRemainsTime", "weekly_end_time", "weeklyEndTime"],
          countMeansRemaining
        );
      }

      if (Object.keys(quotas).length === 0) {
        return { message: "MiniMax connected. Unable to extract quota usage." };
      }

      return { quotas };
    } catch (error) {
      lastErrorMessage = error.message;
      if (!canFallback) break;
    }
  }

  return { message: lastErrorMessage ? `MiniMax connected. Unable to fetch usage: ${lastErrorMessage}` : "MiniMax connected. Unable to fetch usage." };
}

/**
 * Alibaba Cloud Model Studio (DashScope) Coding Plan usage
 */
export async function getAlicodeUsage(apiKey, provider, proxyOptions = null) {
  const isIntl = provider === "alicode-intl";
  const region = isIntl ? "International" : "China";
  const consoleUrl = isIntl
    ? "https://modelstudio.console.alibabacloud.com/ap-southeast-1/?tab=globalset#/efm/coding_plan"
    : "https://bailian.console.aliyun.com/cn-beijing/?tab=model#/efm/coding_plan";

  const isCodingPlanKey = apiKey && apiKey.startsWith("sk-sp-");

  if (!apiKey) {
    return { message: "Alibaba API key not available." };
  }

  if (!isCodingPlanKey) {
    return {
      message: `This appears to be a standard DashScope API key (sk-xxx), not a Coding Plan key (sk-sp-xxx). Coding Plan quota tracking requires a subscription API key.`,
    };
  }

  const baseUrl = isIntl
    ? "https://coding-intl.dashscope.aliyuncs.com"
    : "https://coding.dashscope.aliyuncs.com";

  let detectedPlan = null;
  let rawHeaders = {};

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await proxyAwareFetch(`${baseUrl}/v1/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    }, proxyOptions);

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { message: "Alibaba API key invalid or expired. Please check your Coding Plan subscription." };
      }
      console.warn(`[Alicode Usage] Models endpoint returned ${response.status}`);
    }

    for (const [key, value] of response.headers.entries()) {
      const lk = key.toLowerCase();
      if (lk.includes("rate") || lk.includes("quota") || lk.includes("limit") || lk.includes("remaining") || lk.includes("plan") || lk.includes("tier")) {
        rawHeaders[key] = value;
      }
    }

    if (Object.keys(rawHeaders).length > 0) {
      console.log(`[Alicode Usage] Rate limit headers:`, rawHeaders);

      for (const [, value] of Object.entries(rawHeaders)) {
        const numMatch = value.match(/(\d+)/);
        if (numMatch) {
          const num = parseInt(numMatch[1], 10);
          if (num === 6000) detectedPlan = "pro";
          else if (num === 1200) detectedPlan = "lite";
          else if (num >= 45000) detectedPlan = "pro";
          else if (num === 9000 || num === 18000) detectedPlan = "lite";
        }
      }
    }
  } catch (error) {
    console.warn(`[Alicode Usage] Probe failed: ${error.message}`);
  }

  if (detectedPlan === "lite") {
    return {
      plan: "Coding Plan Lite",
      quotas: {
        "5-hour (sliding)": { used: 0, total: 1200, resetAt: null, note: "Rolling window - resets 5h after each request" },
        "weekly (7d)": { used: 0, total: 9000, resetAt: null, note: "Resets Monday 00:00 UTC+8" },
        "monthly (30d)": { used: 0, total: 18000, resetAt: null, note: "Resets on subscription date monthly (UTC+8)" },
      },
      message: `Alibaba ${region} Coding Plan Lite detected. Check detailed usage at: ${consoleUrl}`,
    };
  }

  if (detectedPlan === "pro") {
    return {
      plan: "Coding Plan Pro",
      quotas: {
        "5-hour (sliding)": { used: 0, total: 6000, resetAt: null, note: "Rolling window - resets 5h after each request" },
        "weekly (7d)": { used: 0, total: 45000, resetAt: null, note: "Resets Monday 00:00 UTC+8" },
        "monthly (30d)": { used: 0, total: 90000, resetAt: null, note: "Resets on subscription date monthly (UTC+8)" },
      },
      message: `Alibaba ${region} Coding Plan Pro detected. Check detailed usage at: ${consoleUrl}`,
    };
  }

  return {
    plan: "Coding Plan",
    message: `Alibaba ${region} Coding Plan connected. Plan auto-detection unavailable (no quota API). Lite: 1,200 req/5h, 9,000 req/week, 18,000 req/month. Pro: 6,000 req/5h, 45,000 req/week, 90,000 req/month. Check plan & usage at: ${consoleUrl}`,
    quotas: [],
  };
}
