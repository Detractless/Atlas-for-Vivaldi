export function generateAcronymSvg(text, color) {
  const acronym = text.trim().toUpperCase().substring(0, 2);
  const textColor = color || "#3b82f6";
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 32 32"><text x="50%" y="50%" dy=".36em" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="16" fill="${textColor}">${acronym}</text></svg>`;
  return "data:image/svg+xml;base64," + btoa(svgString);
}
