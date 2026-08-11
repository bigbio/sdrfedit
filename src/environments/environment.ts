/**
 * Build-time configuration.
 *
 * `assistantBaseUrl` points at the SDRF Wizard AI Assistant backend (see
 * `backend/README.md`). Deployments that load the editor from a CDN cannot
 * rebuild, so the value can also be overridden at runtime — see
 * `resolveAssistantBaseUrl()` in
 * `src/app/core/services/assistant/assistant-api.service.ts`.
 */
export const environment = {
  production: false,
  assistantBaseUrl: 'http://localhost:8000',
};
