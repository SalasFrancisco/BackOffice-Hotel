import type { ElementType } from 'react';
import {
  getServiceDescriptionHtml,
  hasServiceDescriptionContent,
} from '../utils/serviceDescriptionRichText';

type RichTextDescriptionProps = {
  value?: string | null;
  className?: string;
  as?: ElementType;
};

export function RichTextDescription({
  value,
  className,
  as: Component = 'div',
}: RichTextDescriptionProps) {
  if (!hasServiceDescriptionContent(value)) {
    return null;
  }

  return (
    <Component
      className={className}
      dangerouslySetInnerHTML={{ __html: getServiceDescriptionHtml(value) }}
    />
  );
}
