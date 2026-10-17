

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.storage?.session?.setAccessLevel) {
    chrome.storage.session.setAccessLevel({
      accessLevel: 'TRUSTED_CONTEXTS',
    });
  }
});