// background.js

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'OPEN_PROFILE_AND_CONNECT') {
    const url = new URL(message.profileUrl);
    url.searchParams.set('autoConnect', 'true');
    
    chrome.tabs.create({ url: url.toString(), active: false }, (tab) => {
      sendResponse({ status: 'tab_opened', tabId: tab.id });
    });
    return true;
  }

  if (message.action === 'CLOSE_CURRENT_TAB') {
    if (sender.tab && sender.tab.id) {
      chrome.tabs.remove(sender.tab.id);
    }
    sendResponse({ status: 'tab_closed' });
  }
});
