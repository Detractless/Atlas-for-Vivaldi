// The social media filter (Settings > Focus > Content shield): which parts of social sites to hide. This file is the
// list of parts and the rules for choosing them, with no page or storage in it, so they can be tested alone.
//
// One setting, `socialFilter`: { mode, parts }. `mode` is 'off', 'parts' (hide the chosen parts) or 'all' (hide the
// social sites entirely); `parts` is the list of chosen part ids, kept while the mode is something else.
// While its Focus lock holds, the filter can only get stricter: the mode can't go back down, and a chosen part
// can't be unchosen (looser(), used by utils/focusLock.js). pages/newtab/profilesCore.js repeats looser() in its
// own words (it can't import); keep the two the same.
//
// Spec 006 (docs/specs/006-social-filter-blocking) is how the choices work on the sites. 'all' blocks a site
// entirely (background/socialBlock.js); 'parts' hides parts of a site (components/atlas/atlas-social-<site>.js).

/** The sites whose parts really block: a site is added when its page script is `live: true`, after its live
    review passed. tests/unit/social_sites.test.js keeps this list and the scripts in step. 'all' works on every site. */
export const LIVE_SITES = ['YouTube', 'Reddit', 'Twitch', 'X', 'Instagram', 'TikTok', 'Facebook', 'Snapchat'];
export const partsLive = () => (LIVE_SITES.length === 0 ? 'none' : LIVE_SITES.length === SITES.length ? 'all' : 'some');

/* The sites, and where each lives. The page scripts (components/atlas/atlas-social-<key>.js), their registration
   (src/modules/03-bridge-content-scripts.js) and the block-sites-entirely guard (background/socialBlock.js) all
   use these hosts; tests/unit/social_sites.test.js checks they agree. A host covers its subdomains. */
export const SITES = [
  { name: 'YouTube', key: 'youtube', hosts: ['youtube.com'], aliases: ['youtu.be'] },
  { name: 'Reddit', key: 'reddit', hosts: ['reddit.com'], aliases: ['redd.it'] },
  { name: 'Twitch', key: 'twitch', hosts: ['twitch.tv'], aliases: [] },
  { name: 'X', key: 'x', hosts: ['x.com', 'twitter.com'], aliases: [] },
  { name: 'Instagram', key: 'instagram', hosts: ['instagram.com'], aliases: ['instagr.am'] },
  { name: 'TikTok', key: 'tiktok', hosts: ['tiktok.com'], aliases: [] },
  { name: 'Facebook', key: 'facebook', hosts: ['facebook.com'], aliases: ['fb.com', 'fb.me', 'fb.watch', 'messenger.com'] },
  { name: 'Snapchat', key: 'snapchat', hosts: ['snapchat.com'], aliases: [] },
];

/** The site `url` belongs to, or null. Only the page's own host counts, so a link to a site is not the site.
    `aliases` are the site's short-link and sister hosts (youtu.be, fb.me): hosts for blocking, but no page scripts. */
export function siteOf(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase().replace(/\.$/, ''); } catch (e) { return null; }
  return SITES.find((s) => s.hosts.concat(s.aliases).some((h) => host === h || host.endsWith('.' + h))) || null;
}

export const MODES = { off: 'Off', parts: 'Block selected parts', all: 'Block social sites entirely' };
const RANK = { off: 0, parts: 1, all: 2 };

/* The parts, in the order Settings shows them. `sites` is where each is planned to work: what the hover card says. */
export const GROUPS = [
  { id: 'feeds', label: 'Feeds', parts: [
    { id: 'homeFeed', label: 'Home feed', desc: 'Endless scrolling feeds', sites: ['Reddit', 'TikTok', 'Facebook'] },
    { id: 'suggested', label: 'Suggested content', desc: '“Up next”, “For you” and related videos', sites: ['YouTube', 'Reddit'] },
    { id: 'trending', label: 'Trending and Explore', desc: 'Trending topics, Explore pages, Popular and All', sites: ['X', 'Reddit'] },
    { id: 'whoToFollow', label: 'Who to follow', desc: 'Account suggestions', sites: ['X', 'Instagram'] },
    { id: 'stories', label: 'Stories', desc: 'The round tray of short-lived posts', sites: ['Instagram', 'Facebook'] },
  ] },
  { id: 'video', label: 'Video', parts: [
    { id: 'shortVideos', label: 'Short videos', desc: 'Shorts, Reels and TikTok-style clips', sites: ['YouTube', 'TikTok', 'Instagram', 'Snapchat'] },
    { id: 'autoplay', label: 'Autoplay', desc: 'The next video, and previews that play on their own', sites: ['YouTube'] },
    { id: 'liveStreams', label: 'Live streams', desc: 'Live videos and their chat', sites: ['Twitch', 'YouTube'] },
    { id: 'upNext', label: 'Up-next cards', desc: 'The cards and countdown that come after a video', sites: ['YouTube'] },
    { id: 'hoverPreviews', label: 'Hover previews', desc: 'Thumbnails that play when you point at them', sites: ['YouTube'] },
  ] },
  { id: 'interaction', label: 'Interaction', parts: [
    { id: 'likes', label: 'Likes and dislikes', desc: 'The buttons and reactions', sites: ['YouTube', 'Reddit', 'TikTok', 'Instagram'] },
    { id: 'follow', label: 'Subscribe and follow', desc: 'The buttons that ask you to follow', sites: ['X', 'YouTube', 'Instagram', 'TikTok'] },
    { id: 'comments', label: 'Comments', desc: 'Reading and writing them', sites: ['YouTube', 'Reddit'] },
    { id: 'share', label: 'Share and repost', desc: 'The share and repost buttons', sites: ['YouTube', 'Reddit', 'TikTok'] },
    { id: 'messages', label: 'Direct messages', desc: 'Inboxes and chat pop-ups', sites: ['Instagram'] },
    { id: 'posting', label: 'Posting', desc: 'The boxes and buttons for making a post', sites: ['Facebook', 'TikTok'] },
  ] },
  { id: 'numbers', label: 'Numbers and alerts', parts: [
    { id: 'counts', label: 'Like and view counts', desc: 'Likes, views and comments, shown as numbers', sites: ['YouTube', 'TikTok', 'Instagram', 'Reddit'] },
    { id: 'followers', label: 'Follower counts', desc: 'Followers and subscribers, shown as numbers', sites: ['YouTube', 'X', 'Instagram'] },
    { id: 'badges', label: 'Notification badges', desc: 'Red dots, the bell, and the “(3)” in tab titles', sites: ['Twitch', 'Facebook'] },
    { id: 'newPosts', label: 'New-posts banners', desc: 'The “see new posts” bars', sites: ['X'] },
  ] },
];

export const PARTS = GROUPS.flatMap((g) => g.parts);
export const PART_IDS = PARTS.map((p) => p.id);
export const partOf = (id) => PARTS.find((p) => p.id === id) || null;

/** The setting made safe: a known mode, and the known part ids once each, in Settings' order. */
export function normalize(value) {
  const v = value && typeof value === 'object' ? value : {};
  const chosen = new Set(Array.isArray(v.parts) ? v.parts : []);
  return { mode: Object.prototype.hasOwnProperty.call(RANK, v.mode) ? v.mode : 'off', parts: PART_IDS.filter((id) => chosen.has(id)) };
}

export const withMode = (value, mode) => ({ ...normalize(value), mode });

/** The setting with `id` chosen or unchosen. */
export function togglePart(value, id) {
  const f = normalize(value);
  if (!PART_IDS.includes(id)) return f;
  return { ...f, parts: PART_IDS.filter((p) => (p === id ? !f.parts.includes(id) : f.parts.includes(p))) };
}

/** Whether `to` is looser than `from`: a lower mode, or the same 'parts' mode with a chosen part dropped. */
export function looser(from, to) {
  const a = normalize(from), b = normalize(to);
  if (RANK[b.mode] !== RANK[a.mode]) return RANK[b.mode] < RANK[a.mode];
  return a.mode === 'parts' && a.parts.some((id) => !b.parts.includes(id));
}
