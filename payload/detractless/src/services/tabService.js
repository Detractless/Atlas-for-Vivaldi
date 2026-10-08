export async function getTabCount() {
  const tabs = await chrome.tabs.query({});
  return tabs.length;
}
