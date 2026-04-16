import { useEffect, useRef } from 'react';
import {
  getServiceDescriptionHtml,
  hasServiceDescriptionContent,
  sanitizeServiceDescriptionMarkup,
} from '../utils/serviceDescriptionRichText';

type ServiceDescriptionEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

const insertPlainTextAtCursor = (text: string) => {
  const escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '<br>');

  document.execCommand('insertHTML', false, escapedText);
};

export function ServiceDescriptionEditor({
  value,
  onChange,
  placeholder = 'Descripcion opcional',
}: ServiceDescriptionEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || isFocusedRef.current) return;

    const nextHtml = getServiceDescriptionHtml(value);
    if (editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
  }, [value]);

  const commitEditorValue = () => {
    const editor = editorRef.current;
    if (!editor) return;

    const sanitizedValue = sanitizeServiceDescriptionMarkup(editor.innerHTML);
    if (sanitizedValue !== value) {
      onChange(sanitizedValue);
    }
  };

  const applyFormat = (command: 'bold' | 'italic') => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    document.execCommand(command, false);
    commitEditorValue();
  };

  const handleInput = () => {
    commitEditorValue();
  };

  const handleBlur = () => {
    const editor = editorRef.current;
    if (!editor) return;

    isFocusedRef.current = false;
    const sanitizedValue = sanitizeServiceDescriptionMarkup(editor.innerHTML);
    const normalizedHtml = getServiceDescriptionHtml(sanitizedValue);

    if (editor.innerHTML !== normalizedHtml) {
      editor.innerHTML = normalizedHtml;
    }

    if (sanitizedValue !== value) {
      onChange(sanitizedValue);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            applyFormat('bold');
          }}
          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          title="Aplicar negrita"
        >
          B
        </button>
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            applyFormat('italic');
          }}
          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm italic text-gray-700 hover:bg-gray-50 transition-colors"
          title="Aplicar cursiva"
        >
          I
        </button>
        <p className="text-xs text-gray-500">
          Selecciona texto y aplica negrita o cursiva.
        </p>
      </div>

      <div className="relative">
        {!hasServiceDescriptionContent(value) && (
          <span className="pointer-events-none absolute left-4 top-3 text-sm text-gray-400">
            {placeholder}
          </span>
        )}

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onFocus={() => {
            isFocusedRef.current = true;
          }}
          onBlur={handleBlur}
          onInput={handleInput}
          onPaste={(event) => {
            event.preventDefault();
            insertPlainTextAtCursor(event.clipboardData.getData('text/plain'));
            commitEditorValue();
          }}
          className="h-32 w-full overflow-y-auto rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    </div>
  );
}
