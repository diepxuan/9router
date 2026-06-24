import {
  DIEPXUAN_USAGE_APIKEY_PROVIDERS,
  DIEPXUAN_USAGE_SUPPORTED_PROVIDERS,
} from "@/diepxuan/shared/constants/providers.js";

export function extendUsageSupportedProviders(baseProviders) {
  return [...baseProviders, ...DIEPXUAN_USAGE_SUPPORTED_PROVIDERS];
}

export function extendUsageApiKeyProviders(baseProviders) {
  return [...baseProviders, ...DIEPXUAN_USAGE_APIKEY_PROVIDERS];
}

export function isDiepXuanUsageEligible(connection, baseSupportedProviders, baseApiKeyProviders) {
  const supportedProviders = extendUsageSupportedProviders(baseSupportedProviders);
  const apiKeyProviders = extendUsageApiKeyProviders(baseApiKeyProviders);

  return supportedProviders.includes(connection.provider) && (
    connection.authType === "oauth" || apiKeyProviders.includes(connection.provider)
  );
}
