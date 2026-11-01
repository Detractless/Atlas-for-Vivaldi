// The pictures the panel beside the social media filter pills flips through (settings/chipPane.js): one slide per site, each
// a screenshot of that site showing the part, already cut to a 16:10 picture around it. The files are in assets/social/,
// named <part>-<site>.jpg. A part with no pictures yet (New-posts banners) has no entry, and its card is text only.
// The pictures belong to the sites they show; settings/chipPane.js shows them as examples of the part.

export const SLIDE_DIR = 'src/assets/social/';

const s = (img, site) => ({ img, site });

export const SLIDES = {
  homeFeed: [s('homeFeed-reddit', 'Reddit'), s('homeFeed-tiktok-for-you', 'TikTok For You'), s('homeFeed-facebook', 'Facebook')],
  suggested: [s('suggested-youtube', 'YouTube'), s('suggested-reddit', 'Reddit')],
  trending: [s('trending-x', 'X'), s('trending-reddit', 'Reddit')],
  whoToFollow: [s('whoToFollow-x', 'X'), s('whoToFollow-instagram', 'Instagram')],
  stories: [s('stories-instagram', 'Instagram'), s('stories-facebook', 'Facebook')],
  shortVideos: [s('shortVideos-youtube-shorts', 'YouTube Shorts'), s('shortVideos-tiktok-for-you', 'TikTok For You'), s('shortVideos-instagram-reels', 'Instagram Reels'), s('shortVideos-snapchat-spotlight', 'Snapchat Spotlight')],
  autoplay: [s('autoplay-youtube', 'YouTube'), s('autoplay-youtube-controls', 'YouTube controls')],
  liveStreams: [s('liveStreams-twitch', 'Twitch'), s('liveStreams-youtube-live', 'YouTube Live')],
  upNext: [s('upNext-youtube', 'YouTube')],
  hoverPreviews: [s('hoverPreviews-youtube', 'YouTube')],
  likes: [s('likes-youtube', 'YouTube'), s('likes-reddit', 'Reddit'), s('likes-tiktok', 'TikTok'), s('likes-instagram', 'Instagram')],
  follow: [s('follow-x', 'X'), s('follow-youtube', 'YouTube'), s('follow-instagram', 'Instagram'), s('follow-tiktok', 'TikTok')],
  comments: [s('comments-youtube', 'YouTube'), s('comments-reddit', 'Reddit')],
  share: [s('share-youtube', 'YouTube'), s('share-reddit', 'Reddit'), s('share-tiktok', 'TikTok')],
  messages: [s('messages-instagram', 'Instagram')],
  posting: [s('posting-facebook', 'Facebook'), s('posting-tiktok', 'TikTok')],
  counts: [s('counts-youtube', 'YouTube'), s('counts-instagram', 'Instagram'), s('counts-tiktok', 'TikTok'), s('counts-reddit', 'Reddit')],
  followers: [s('followers-youtube', 'YouTube'), s('followers-x', 'X'), s('followers-instagram', 'Instagram')],
  badges: [s('badges-twitch', 'Twitch'), s('badges-facebook', 'Facebook')],
};

/** The slides for a part, or [] when it has none. */
export const slidesOf = (id) => SLIDES[id] || [];
