export function getBridgeAuthHeaders(): Record<string, string> {
  const extensionId = typeof chrome === 'undefined' ? undefined : chrome.runtime?.id;
  return extensionId ? { 'X-Chrome-Extension-Id': extensionId } : {};
}