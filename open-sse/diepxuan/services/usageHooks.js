import { getAlicodeUsage } from "./usage.js";

export async function getDiepXuanUsageForProvider(connection, proxyOptions = null) {
  const { provider, apiKey } = connection;

  switch (provider) {
    case "alicode":
    case "alicode-intl":
      return await getAlicodeUsage(apiKey, provider, proxyOptions);
    default:
      return null;
  }
}
