chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "getBookmarks") {
    chrome.bookmarks.getTree().then(tree => sendResponse({ tree }));
    return true; // async
  }
});
