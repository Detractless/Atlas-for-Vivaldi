export function formatTimeRemaining(ms) {
  const totalSeconds = Math.floor(ms / 1000); const hours = Math.floor(totalSeconds / 3600); const minutes = Math.floor((totalSeconds % 3600) / 60); const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`; if (minutes > 0) return `${minutes}m ${seconds}s`; return `${seconds}s`;
}

export function formatTimeCompact(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
