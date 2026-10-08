import { BookmarkDB } from './bookmarksDB.js';

const STARTER_PAGES = [
  {
    label: 'Essentials',
    groups: {
      'PRODUCTIVITY': [
        { name: 'Notion', url: 'https://notion.so' },
        { name: 'Google Calendar', url: 'https://calendar.google.com' },
        { name: 'Todoist', url: 'https://todoist.com' }
      ],
      'COMMUNICATION': [
        { name: 'Gmail', url: 'https://mail.google.com' },
        { name: 'Slack', url: 'https://slack.com' },
        { name: 'Discord', url: 'https://discord.com' }
      ]
    }
  },
  {
    label: 'AI Tools',
    groups: {
      'AI': [
        { name: 'Claude', url: 'https://claude.ai' },
        { name: 'Perplexity', url: 'https://perplexity.ai' },
        { name: 'Gemini', url: 'https://gemini.google.com' },
        { name: 'Copilot', url: 'https://copilot.microsoft.com' },
        { name: 'NotebookLM', url: 'https://notebooklm.google.com' }
      ]
    }
  }
];

export async function seedStarterContent() {
  const localData = await new Promise(resolve =>
    chrome.storage.local.get(['hasSeededDefaults'], resolve)
  );
  if (localData.hasSeededDefaults) return false;

  const syncData = await new Promise(resolve =>
    chrome.storage.sync.get(['activeTabs'], resolve)
  );
  if (syncData.activeTabs && syncData.activeTabs.some(t => t.type === 'bookmarks')) return false;

  const existing = await BookmarkDB.getAllBookmarks();
  if (Object.keys(existing).length > 0) return false;

  const baseId = Date.now();
  const activeTabs = [{ id: 'search', label: 'Home', type: 'search' }];

  for (let i = 0; i < STARTER_PAGES.length; i++) {
    const page = STARTER_PAGES[i];
    const pageId = baseId + i;
    activeTabs.push({ id: pageId, label: page.label, type: 'bookmarks' });
    await BookmarkDB.saveBookmarks(pageId, page.groups);
  }

  await new Promise(resolve => chrome.storage.sync.set({ activeTabs }, resolve));
  await new Promise(resolve => chrome.storage.local.set({ hasSeededDefaults: true }, resolve));

  return true;
}
