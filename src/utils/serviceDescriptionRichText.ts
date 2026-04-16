const ALLOWED_RICH_TEXT_TAG_PATTERN = /<\/?(?:strong|b|em|i)\s*>|<br\s*\/?>/gi;
const PLACEHOLDER_PREFIX = '__SERVICE_DESCRIPTION_TAG__';

const normalizeAllowedTag = (tag: string) => {
  const normalized = tag.toLowerCase().replace(/\s+/g, '');

  switch (normalized) {
    case '<b>':
      return '<strong>';
    case '</b>':
      return '</strong>';
    case '<i>':
      return '<em>';
    case '</i>':
      return '</em>';
    case '<br/>':
      return '<br>';
    default:
      return normalized;
  }
};

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

export const sanitizeServiceDescriptionMarkup = (value: string) => {
  let normalized = value.replace(/\r\n/g, '\n');
  const placeholders: string[] = [];

  normalized = normalized.replace(ALLOWED_RICH_TEXT_TAG_PATTERN, (match) => {
    const token = `${PLACEHOLDER_PREFIX}${placeholders.length}__`;
    placeholders.push(normalizeAllowedTag(match));
    return token;
  });

  normalized = normalized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  placeholders.forEach((tag, index) => {
    normalized = normalized.replace(`${PLACEHOLDER_PREFIX}${index}__`, tag);
  });

  return normalized;
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
  sanitizeServiceDescriptionMarkup(value || '').replace(/\n/g, '<br />');
