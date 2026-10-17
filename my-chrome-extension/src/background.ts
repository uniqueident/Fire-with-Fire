// Background Service Worker for Fire with Fire Chrome Extension

// Lockdown session storage upon install so untrusted page scripts cannot read tokens
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.storage?.session?.setAccessLevel) {
    chrome.storage.session.setAccessLevel({
      accessLevel: 'TRUSTED_CONTEXTS',
    });
  }
});

