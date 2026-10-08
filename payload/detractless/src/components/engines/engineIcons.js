import { BookmarkDB } from '../../services/bookmarksDB.js';

export async function setEngineIconSrc(imgElement, engine, engineId) {
  const defaultIcon = 'src/assets/svg/default.api.svg';
  if (engine.isCustomIcon) {
    try {
      const iconData = await BookmarkDB.getIcon(engineId);
      if (iconData) { imgElement.src = iconData; } else { imgElement.src = defaultIcon; }
    } catch (e) { imgElement.src = defaultIcon; }
  } else { imgElement.src = engine.icon || defaultIcon; }
}
