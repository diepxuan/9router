import { recordComboModelResult, shouldSkipModelInCombo } from "./comboFailTracker.js";

export function shouldSkipComboModel(modelStr, comboName) {
  return shouldSkipModelInCombo(modelStr, comboName);
}

export function recordComboModelOutcome(modelStr, comboName, success) {
  recordComboModelResult(modelStr, comboName, success);
}
