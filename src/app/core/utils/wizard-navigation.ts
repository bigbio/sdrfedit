export type AssistantNavigationDecision = 'next' | 'back' | 'stay';

/** Keep assistant navigation inside the same validation rules as the wizard UI. */
export function resolveAssistantNavigation(
  currentStep: number,
  targetStep: number,
  canProceed: boolean,
  totalSteps: number
): AssistantNavigationDecision {
  if (!Number.isInteger(targetStep) || targetStep < 0 || targetStep >= totalSteps) {
    return 'stay';
  }
  if (targetStep <= currentStep) return 'back';
  if (targetStep === currentStep + 1 && canProceed) return 'next';
  return 'stay';
}
