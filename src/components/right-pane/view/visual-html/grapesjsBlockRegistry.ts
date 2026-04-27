import type grapesjs from 'grapesjs';

type GjsEditor = ReturnType<typeof grapesjs.init>;

const BASIC_CATEGORY = 'Basic';
const FORMS_CATEGORY = 'Forms';

function blockMedia(iconMarkup: string) {
  return `
    <div style="display:flex;align-items:center;justify-content:center;height:100%;min-height:72px;color:#cbd5e1;">
      ${iconMarkup}
    </div>
  `;
}

function columnBlock(columns: number, ratios?: number[]) {
  const widths = ratios && ratios.length === columns
    ? ratios
    : Array.from({ length: columns }, () => Math.round(100 / columns));

  const columnsMarkup = widths
    .map((width) => `
      <div style="flex:0 0 ${width}%;max-width:${width}%;padding:12px;border:1px dashed #cbd5e1;border-radius:10px;min-height:48px;background:#fff;">
        列内容
      </div>
    `)
    .join('');

  return `
    <div style="display:flex;gap:16px;flex-wrap:wrap;">
      ${columnsMarkup}
    </div>
  `;
}

export function registerVisualHtmlBlocks(editor: GjsEditor) {
  const registryKey = '__ccuiVisualHtmlBlocksRegistered';
  if ((editor as any)[registryKey]) {
    return;
  }

  editor.BlockManager.add('1-column', {
    label: '1 Column',
    category: BASIC_CATEGORY,
    media: blockMedia('<svg width="56" height="44" viewBox="0 0 56 44" fill="none"><rect x="8" y="6" width="40" height="32" rx="3" stroke="currentColor" stroke-width="3"/></svg>'),
    content: columnBlock(1),
  });

  editor.BlockManager.add('2-columns', {
    label: '2 Columns',
    category: BASIC_CATEGORY,
    media: blockMedia('<svg width="56" height="44" viewBox="0 0 56 44" fill="none"><rect x="8" y="6" width="16" height="32" rx="3" stroke="currentColor" stroke-width="3"/><rect x="32" y="6" width="16" height="32" rx="3" stroke="currentColor" stroke-width="3"/></svg>'),
    content: columnBlock(2),
  });

  editor.BlockManager.add('3-columns', {
    label: '3 Columns',
    category: BASIC_CATEGORY,
    media: blockMedia('<svg width="56" height="44" viewBox="0 0 56 44" fill="none"><rect x="6" y="6" width="10" height="32" rx="2" stroke="currentColor" stroke-width="3"/><rect x="23" y="6" width="10" height="32" rx="2" stroke="currentColor" stroke-width="3"/><rect x="40" y="6" width="10" height="32" rx="2" stroke="currentColor" stroke-width="3"/></svg>'),
    content: columnBlock(3),
  });

  editor.BlockManager.add('text', {
    label: 'Text',
    category: BASIC_CATEGORY,
    media: blockMedia('<svg width="56" height="44" viewBox="0 0 56 44" fill="none"><path d="M10 10H46V16H32V34H24V16H10V10Z" fill="currentColor"/></svg>'),
    content: '<div style="font-size:16px;line-height:1.6;color:#111827;">插入一段文本内容</div>',
  });

  editor.BlockManager.add('link', {
    label: 'Link',
    category: BASIC_CATEGORY,
    media: blockMedia('<svg width="56" height="44" viewBox="0 0 56 44" fill="none"><path d="M23 27L33 17M20 30H16C12.6863 30 10 27.3137 10 24C10 20.6863 12.6863 18 16 18H22M34 14H40C43.3137 14 46 16.6863 46 20C46 23.3137 43.3137 26 40 26H34" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>'),
    content: '<a href="#" style="color:#2563eb;text-decoration:underline;">添加链接</a>',
  });

  editor.BlockManager.add('image', {
    label: 'Image',
    category: BASIC_CATEGORY,
    media: blockMedia('<svg width="56" height="44" viewBox="0 0 56 44" fill="none"><rect x="8" y="8" width="40" height="28" rx="4" stroke="currentColor" stroke-width="3"/><path d="M14 30L24 20L31 27L36 22L42 30" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="16" r="3" fill="currentColor"/></svg>'),
    content: { type: 'image' },
  });

  editor.BlockManager.add('video', {
    label: 'Video',
    category: BASIC_CATEGORY,
    media: blockMedia('<svg width="56" height="44" viewBox="0 0 56 44" fill="none"><rect x="8" y="8" width="40" height="28" rx="6" stroke="currentColor" stroke-width="3"/><path d="M25 17L35 22L25 27V17Z" fill="currentColor"/></svg>'),
    content: { type: 'video' },
  });

  editor.BlockManager.add('map', {
    label: 'Map',
    category: BASIC_CATEGORY,
    media: blockMedia('<svg width="56" height="44" viewBox="0 0 56 44" fill="none"><path d="M10 12L22 8L34 12L46 8V32L34 36L22 32L10 36V12Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M22 8V32M34 12V36" stroke="currentColor" stroke-width="3"/></svg>'),
    content: '<iframe src="https://maps.google.com/maps?q=shanghai&t=&z=13&ie=UTF8&iwloc=&output=embed" style="width:100%;min-height:320px;border:0;border-radius:12px;" loading="lazy"></iframe>',
  });

  editor.BlockManager.add('quote', {
    label: 'Quote',
    category: BASIC_CATEGORY,
    media: blockMedia('<svg width="56" height="44" viewBox="0 0 56 44" fill="none"><path d="M15 28H9L13 16H21L15 28ZM35 28H29L33 16H41L35 28Z" fill="currentColor"/></svg>'),
    content: '<blockquote style="padding:16px 20px;border-left:4px solid #2563eb;background:#f8fafc;color:#334155;">在这里输入引用内容</blockquote>',
  });

  editor.BlockManager.add('text-section', {
    label: 'Text section',
    category: BASIC_CATEGORY,
    media: blockMedia('<svg width="56" height="44" viewBox="0 0 56 44" fill="none"><path d="M12 14H44M12 22H44M12 30H34" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>'),
    content: `
      <section style="padding:24px;border:1px solid #e5e7eb;border-radius:16px;background:#fff;">
        <h3 style="margin:0 0 12px;font-size:24px;color:#111827;">章节标题</h3>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#475569;">这里是一段更完整的说明文本，用来承载段落型内容。</p>
      </section>
    `,
  });

  editor.BlockManager.add('form', {
    label: 'Form',
    category: FORMS_CATEGORY,
    media: blockMedia('<svg width="56" height="44" viewBox="0 0 56 44" fill="none"><rect x="10" y="8" width="36" height="28" rx="4" stroke="currentColor" stroke-width="3"/><path d="M18 18H38M18 26H30" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>'),
    content: { type: 'ccui-form' },
  });

  editor.BlockManager.add('input', {
    label: 'Input',
    category: FORMS_CATEGORY,
    media: blockMedia('<svg width="56" height="44" viewBox="0 0 56 44" fill="none"><rect x="10" y="10" width="36" height="24" rx="4" stroke="currentColor" stroke-width="3"/><path d="M18 22H30" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>'),
    content: { type: 'ccui-form-input' },
  });

  editor.BlockManager.add('textarea', {
    label: 'Textarea',
    category: FORMS_CATEGORY,
    media: blockMedia('<svg width="56" height="44" viewBox="0 0 56 44" fill="none"><rect x="10" y="8" width="36" height="28" rx="4" stroke="currentColor" stroke-width="3"/><path d="M18 18H38M18 24H38M18 30H30" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>'),
    content: { type: 'ccui-form-textarea' },
  });

  editor.BlockManager.add('select', {
    label: 'Select',
    category: FORMS_CATEGORY,
    media: blockMedia('<svg width="56" height="44" viewBox="0 0 56 44" fill="none"><rect x="10" y="10" width="36" height="24" rx="4" stroke="currentColor" stroke-width="3"/><path d="M32 20L28 24L24 20" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
    content: { type: 'ccui-form-select' },
  });

  editor.BlockManager.add('checkbox', {
    label: 'Checkbox',
    category: FORMS_CATEGORY,
    media: blockMedia('<svg width="56" height="44" viewBox="0 0 56 44" fill="none"><rect x="12" y="12" width="12" height="12" rx="2" stroke="currentColor" stroke-width="3"/><path d="M16 18L18 20L22 15" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M30 18H44" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>'),
    content: { type: 'ccui-form-checkbox-group' },
  });

  editor.BlockManager.add('radio', {
    label: 'Radio',
    category: FORMS_CATEGORY,
    media: blockMedia('<svg width="56" height="44" viewBox="0 0 56 44" fill="none"><circle cx="18" cy="18" r="7" stroke="currentColor" stroke-width="3"/><circle cx="18" cy="18" r="2.5" fill="currentColor"/><path d="M30 18H44" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>'),
    content: { type: 'ccui-form-radio-group' },
  });

  editor.BlockManager.add('button', {
    label: 'Button',
    category: FORMS_CATEGORY,
    media: blockMedia('<svg width="56" height="44" viewBox="0 0 56 44" fill="none"><rect x="12" y="12" width="32" height="20" rx="10" stroke="currentColor" stroke-width="3"/><path d="M22 22H34" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>'),
    content: { type: 'ccui-form-button' },
  });

  (editor as any)[registryKey] = true;
}
