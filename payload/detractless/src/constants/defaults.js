export const DEFAULT_THEME = {
  "_comment": "Theme settings: 'system' <- Follows System settings (Light/Dark). 'dark' <- Forces standard Dark mode. 'light' <- Forces standard Light mode. 'custom' <- Uses the CustomColors mapped below. Note: To apply changes, reload the page.",
  "Theme": "dark",
  "CustomColors": {
    "WindowBackground": "#1E1E1E",
    "ControlBackground": "#2D2D2D",
    "ControlHover": "#3A3A3A",
    "BorderColor": "#444444",
    "TextPrimary": "#FFFFFF",
    "TextSecondary": "#999999",
    "SelectionBackground": "#2A2A2A"
  }
};

export const DEFAULT_TABS = [{ id: 'search', label: 'Dashboard', sub: 'Everything at a glance', type: 'search' }];
