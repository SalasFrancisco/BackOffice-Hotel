const BLOCK_TAGS = new Set(['div', 'p', 'li']);

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

const wrapWithAllowedFormatting = (content: string, bold: boolean, italic: boolean) => {
  let wrapped = content;

  if (!wrapped) return '';
  if (bold) wrapped = `<strong>${wrapped}</strong>`;
  if (italic) wrapped = `<em>${wrapped}</em>`;

  return wrapped;
};

const elementHasBoldStyle = (element: HTMLElement) => {
  const fontWeight = element.style.fontWeight?.trim().toLowerCase() || '';
  if (!fontWeight) return false;

  return fontWeight === 'bold' || Number(fontWeight) >= 600;
};

const elementHasItalicStyle = (element: HTMLElement) =>
  element.style.fontStyle?.trim().toLowerCase() === 'italic';

const cleanupRichTextHtml = (value: string) => {
  let normalized = value
    .replace(/(?:<br>\s*){3,}/gi, '<br><br>')
    .replace(/^(?:<br>\s*)+|(?:<br>\s*)+$/gi, '');

  let previous = '';
  while (normalized !== previous) {
    previous = normalized;
    normalized = normalized
      .replace(/<strong><\/strong>/gi, '')
      .replace(/<em><\/em>/gi, '')
      .replace(/<strong>(<br>)+<\/strong>/gi, '$1')
      .replace(/<em>(<br>)+<\/em>/gi, '$1');
  }

  return normalized;
};

const fallbackSanitizeServiceDescriptionMarkup = (value: string) => {
  let normalized = value.replace(/\r\n/g, '\n');
  const placeholders: string[] = [];

  normalized = normalized.replace(/<\/?(?:strong|b|em|i)\s*>|<br\s*\/?>/gi, (match) => {
    const index = placeholders.length;
    const compact = match.toLowerCase().replace(/\s+/g, '');
    const safeTag =
      compact === '<b>' ? '<strong>'
      : compact === '</b>' ? '</strong>'
      : compact === '<i>' ? '<em>'
      : compact === '</i>' ? '</em>'
      : compact === '<br/>' ? '<br>'
      : compact;

    placeholders.push(safeTag);
    return `__SERVICE_DESCRIPTION_TAG__${index}__`;
  });

  normalized = escapeHtml(normalized);

  placeholders.forEach((tag, index) => {
    normalized = normalized.replace(`__SERVICE_DESCRIPTION_TAG__${index}__`, tag);
  });

  return cleanupRichTextHtml(normalized.replace(/\n/g, '<br>'));
};

const normalizeNode = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent || '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();

  if (tagName === 'br') {
    return '<br>';
  }

  let content = Array.from(element.childNodes).map(normalizeNode).join('');
  const bold = tagName === 'strong' || tagName === 'b' || elementHasBoldStyle(element);
  const italic = tagName === 'em' || tagName === 'i' || elementHasItalicStyle(element);

  content = wrapWithAllowedFormatting(content, bold, italic);

  if (BLOCK_TAGS.has(tagName)) {
    return content ? `${content}<br>` : '';
  }

  return content;
};

export const sanitizeServiceDescriptionMarkup = (value: string) => {
  const normalizedInput = (value || '').replace(/\r\n/g, '\n').replace(/\n/g, '<br>');

  if (typeof DOMParser === 'undefined') {
    return fallbackSanitizeServiceDescriptionMarkup(normalizedInput);
  }

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(`<div>${normalizedInput}</div>`, 'text/html');
  const root = documentNode.body.firstElementChild;

  if (!root) {
    return '';
  }

  const html = Array.from(root.childNodes).map(normalizeNode).join('');
  return cleanupRichTextHtml(html);
};

export const getServiceDescriptionPlainText = (value?: string | null) =>
  decodeHtmlEntities(
    sanitizeServiceDescriptionMarkup(value || '')
      .replace(/<\/?(?:strong|em)\s*>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n'),
  );

export const hasServiceDescriptionContent = (value?: string | null) =>
  /\S/.test(getServiceDescriptionPlainText(value));

export const getServiceDescriptionHtml = (value?: string | null) =>
  sanitizeServiceDescriptionMarkup(value || '');
