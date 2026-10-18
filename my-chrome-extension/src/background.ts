// Background Service Worker for Fire with Fire Chrome Extension

// Lockdown session storage upon install so untrusted page scripts cannot read tokens
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
    console.error('Failed to enable the Mente side panel:', error);
  });

  if (chrome.storage?.session?.setAccessLevel) {
    chrome.storage.session.setAccessLevel({
      accessLevel: 'TRUSTED_CONTEXTS',
    });
  }
});
