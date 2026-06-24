import { getManualQuota, hasManualQuota } from "@/diepxuan/lib/db/repos/manualQuotaRepo.js";

export {
  extendUsageApiKeyProviders,
  extendUsageSupportedProviders,
  isDiepXuanUsageEligible,
} from "./providers.js";

export async function getUsageOverride(connection, connectionId) {
  if (!hasManualQuota(connection.provider)) return null;
  return getManualQuota(connection.provider, connectionId, connection);
}
