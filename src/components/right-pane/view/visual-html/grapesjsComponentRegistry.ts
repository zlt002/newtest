import type grapesjs from 'grapesjs';

type GjsEditor = ReturnType<typeof grapesjs.init>;

type FormOption = {
  label: string;
  value: string;
};

const traitFactory = {
  label: () => ({
    type: 'text',
    name: 'fieldLabel',
    label: '字段标签',
    changeProp: true,
  }),
  name: () => ({
    type: 'text',
    name: 'name',
    label: '字段名',
    changeProp: true,
  }),
  placeholder: () => ({
    type: 'text',
    name: 'placeholder',
    label: '占位符',
    changeProp: true,
  }),
  required: () => ({
    type: 'checkbox',
    name: 'required',
    label: '必填',
    valueTrue: true,
    valueFalse: false,
    changeProp: true,
  }),
  options: () => ({
    type: 'text',
    name: 'options',
    label: '选项列表',
    placeholder: '选项1|value1, 选项2|value2',
    changeProp: true,
  }),
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 'required' || value === 1;
}

function parseOptions(value: string): FormOption[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [label, rawValue] = item.split('|').map((part) => part.trim());
      return {
        label: label || rawValue || item,
        value: rawValue || label || item,
      };
    });
}

function buildRequiredMark(required: boolean): string {
  return required ? '<span style="color:#ef4444;margin-left:4px;">*</span>' : '';
}

function syncModelMarkup(model: any, markup: string) {
  model.components(markup);
}

function bindMarkupSync(model: any, keys: string[], render: () => string) {
  const events = keys.map((key) => `change:${key}`).join(' ');
  const sync = () => {
    syncModelMarkup(model, render());
  };

  model.on(events, sync);
  sync();
}

function buildFieldWrapper(label: string, required: boolean, bodyMarkup: string) {
  return `
    <div style="display:flex;flex-direction:column;gap:8px;width:100%;" data-ccui-field-wrapper="true">
      <label style="display:inline-flex;align-items:center;font-size:14px;font-weight:600;color:#111827;">
        ${escapeHtml(label)}
        ${buildRequiredMark(required)}
      </label>
      ${bodyMarkup}
    </div>
  `;
}

function registerForm(editor: GjsEditor) {
  editor.DomComponents.addType('ccui-form', {
    isComponent: (element) => (
      element instanceof HTMLElement && element.getAttribute('data-ccui-form') === 'true'
        ? { type: 'ccui-form' }
        : undefined
    ),
    model: {
      defaults: {
        tagName: 'form',
        droppable: true,
        attributes: {
          'data-ccui-form': 'true',
          method: 'post',
          action: '#',
          style: 'display:flex;flex-direction:column;gap:16px;width:100%;',
        },
        traits: [
          {
            type: 'text',
            name: 'action',
            label: '提交地址',
            changeProp: true,
          },
          {
            type: 'select',
            name: 'method',
            label: '提交方式',
            changeProp: true,
            options: [
              { id: 'post', label: 'POST' },
              { id: 'get', label: 'GET' },
            ],
          },
        ],
        action: '#',
        method: 'post',
        components: `
          <div data-gjs-droppable="true" style="min-height:48px;border:1px dashed #cbd5e1;border-radius:12px;padding:16px;color:#64748b;">
            将表单字段拖到这里
          </div>
        `,
      },
      init(this: any) {
        const syncAttributes = () => {
          this.addAttributes({
            action: this.get('action') || '#',
            method: this.get('method') || 'post',
          });
        };

        this.on('change:action change:method', syncAttributes);
        syncAttributes();
      },
    },
  });
}

function registerInput(editor: GjsEditor) {
  editor.DomComponents.addType('ccui-form-input', {
    isComponent: (element) => (
      element instanceof HTMLElement && element.getAttribute('data-ccui-form-input') === 'true'
        ? { type: 'ccui-form-input' }
        : undefined
    ),
    model: {
      defaults: {
        tagName: 'div',
        draggable: 'form, [data-ccui-form="true"], [data-gjs-type="default"]',
        droppable: false,
        attributes: { 'data-ccui-form-input': 'true' },
        fieldLabel: '输入框',
        name: 'fieldName',
        placeholder: '请输入内容',
        required: false,
        inputType: 'text',
        traits: [
          traitFactory.label(),
          traitFactory.name(),
          traitFactory.placeholder(),
          traitFactory.required(),
          {
            type: 'select',
            name: 'inputType',
            label: '输入类型',
            changeProp: true,
            options: [
              { id: 'text', label: '文本' },
              { id: 'email', label: '邮箱' },
              { id: 'tel', label: '电话' },
              { id: 'number', label: '数字' },
              { id: 'date', label: '日期' },
            ],
          },
        ],
      },
      init(this: any) {
        bindMarkupSync(this, ['fieldLabel', 'name', 'placeholder', 'required', 'inputType'], () => {
          const required = normalizeBoolean(this.get('required'));
          return buildFieldWrapper(
            this.get('fieldLabel') || '输入框',
            required,
            `<input type="${escapeHtml(this.get('inputType') || 'text')}" name="${escapeHtml(this.get('name') || 'fieldName')}" placeholder="${escapeHtml(this.get('placeholder') || '')}" ${required ? 'required' : ''} style="width:100%;padding:12px 14px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;" />`,
          );
        });
      },
    },
  });
}

function registerTextarea(editor: GjsEditor) {
  editor.DomComponents.addType('ccui-form-textarea', {
    isComponent: (element) => (
      element instanceof HTMLElement && element.getAttribute('data-ccui-form-textarea') === 'true'
        ? { type: 'ccui-form-textarea' }
        : undefined
    ),
    model: {
      defaults: {
        tagName: 'div',
        draggable: 'form, [data-ccui-form="true"], [data-gjs-type="default"]',
        droppable: false,
        attributes: { 'data-ccui-form-textarea': 'true' },
        fieldLabel: '多行输入',
        name: 'textareaField',
        placeholder: '请输入内容',
        required: false,
        rows: '4',
        traits: [
          traitFactory.label(),
          traitFactory.name(),
          traitFactory.placeholder(),
          traitFactory.required(),
          {
            type: 'number',
            name: 'rows',
            label: '行数',
            changeProp: true,
          },
        ],
      },
      init(this: any) {
        bindMarkupSync(this, ['fieldLabel', 'name', 'placeholder', 'required', 'rows'], () => {
          const required = normalizeBoolean(this.get('required'));
          return buildFieldWrapper(
            this.get('fieldLabel') || '多行输入',
            required,
            `<textarea name="${escapeHtml(this.get('name') || 'textareaField')}" placeholder="${escapeHtml(this.get('placeholder') || '')}" rows="${escapeHtml(String(this.get('rows') || '4'))}" ${required ? 'required' : ''} style="width:100%;padding:12px 14px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;min-height:120px;"></textarea>`,
          );
        });
      },
    },
  });
}

function registerSelect(editor: GjsEditor) {
  editor.DomComponents.addType('ccui-form-select', {
    isComponent: (element) => (
      element instanceof HTMLElement && element.getAttribute('data-ccui-form-select') === 'true'
        ? { type: 'ccui-form-select' }
        : undefined
    ),
    model: {
      defaults: {
        tagName: 'div',
        draggable: 'form, [data-ccui-form="true"], [data-gjs-type="default"]',
        droppable: false,
        attributes: { 'data-ccui-form-select': 'true' },
        fieldLabel: '下拉选择',
        name: 'selectField',
        placeholder: '请选择',
        required: false,
        options: '选项一|option-1, 选项二|option-2',
        traits: [
          traitFactory.label(),
          traitFactory.name(),
          traitFactory.placeholder(),
          traitFactory.required(),
          traitFactory.options(),
        ],
      },
      init(this: any) {
        bindMarkupSync(this, ['fieldLabel', 'name', 'placeholder', 'required', 'options'], () => {
          const required = normalizeBoolean(this.get('required'));
          const options = parseOptions(this.get('options') || '');
          const optionsMarkup = options
            .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
            .join('');

          return buildFieldWrapper(
            this.get('fieldLabel') || '下拉选择',
            required,
            `
              <select name="${escapeHtml(this.get('name') || 'selectField')}" ${required ? 'required' : ''} style="width:100%;padding:12px 14px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;background:#fff;">
                <option value="">${escapeHtml(this.get('placeholder') || '请选择')}</option>
                ${optionsMarkup}
              </select>
            `,
          );
        });
      },
    },
  });
}

function buildChoiceGroupMarkup(type: 'checkbox' | 'radio', model: any) {
  const required = normalizeBoolean(model.get('required'));
  const name = model.get('name') || `${type}Field`;
  const options = parseOptions(model.get('options') || '');
  const itemsMarkup = options
    .map((option, index) => `
      <label style="display:inline-flex;align-items:center;gap:8px;font-size:14px;color:#111827;">
        <input type="${type}" name="${escapeHtml(name)}${type === 'checkbox' ? `-${index}` : ''}" value="${escapeHtml(option.value)}" ${required && type === 'radio' && index === 0 ? 'required' : ''} />
        <span>${escapeHtml(option.label)}</span>
      </label>
    `)
    .join('');

  return buildFieldWrapper(
    model.get('fieldLabel') || (type === 'checkbox' ? '复选组' : '单选组'),
    required,
    `<div style="display:flex;flex-wrap:wrap;gap:16px;">${itemsMarkup}</div>`,
  );
}

function registerCheckboxGroup(editor: GjsEditor) {
  editor.DomComponents.addType('ccui-form-checkbox-group', {
    isComponent: (element) => (
      element instanceof HTMLElement && element.getAttribute('data-ccui-form-checkbox-group') === 'true'
        ? { type: 'ccui-form-checkbox-group' }
        : undefined
    ),
    model: {
      defaults: {
        tagName: 'div',
        draggable: 'form, [data-ccui-form="true"], [data-gjs-type="default"]',
        droppable: false,
        attributes: { 'data-ccui-form-checkbox-group': 'true' },
        fieldLabel: '复选组',
        name: 'checkboxField',
        required: false,
        options: '选项一|option-1, 选项二|option-2',
        traits: [
          traitFactory.label(),
          traitFactory.name(),
          traitFactory.required(),
          traitFactory.options(),
        ],
      },
      init(this: any) {
        bindMarkupSync(this, ['fieldLabel', 'name', 'required', 'options'], () => buildChoiceGroupMarkup('checkbox', this));
      },
    },
  });
}

function registerRadioGroup(editor: GjsEditor) {
  editor.DomComponents.addType('ccui-form-radio-group', {
    isComponent: (element) => (
      element instanceof HTMLElement && element.getAttribute('data-ccui-form-radio-group') === 'true'
        ? { type: 'ccui-form-radio-group' }
        : undefined
    ),
    model: {
      defaults: {
        tagName: 'div',
        draggable: 'form, [data-ccui-form="true"], [data-gjs-type="default"]',
        droppable: false,
        attributes: { 'data-ccui-form-radio-group': 'true' },
        fieldLabel: '单选组',
        name: 'radioField',
        required: false,
        options: '选项一|option-1, 选项二|option-2',
        traits: [
          traitFactory.label(),
          traitFactory.name(),
          traitFactory.required(),
          traitFactory.options(),
        ],
      },
      init(this: any) {
        bindMarkupSync(this, ['fieldLabel', 'name', 'required', 'options'], () => buildChoiceGroupMarkup('radio', this));
      },
    },
  });
}

function registerButton(editor: GjsEditor) {
  editor.DomComponents.addType('ccui-form-button', {
    isComponent: (element) => (
      element instanceof HTMLElement && element.getAttribute('data-ccui-form-button') === 'true'
        ? { type: 'ccui-form-button' }
        : undefined
    ),
    model: {
      defaults: {
        tagName: 'div',
        draggable: 'form, [data-ccui-form="true"], [data-gjs-type="default"]',
        droppable: false,
        attributes: { 'data-ccui-form-button': 'true' },
        buttonText: '提交',
        buttonType: 'submit',
        traits: [
          {
            type: 'text',
            name: 'buttonText',
            label: '按钮文案',
            changeProp: true,
          },
          {
            type: 'select',
            name: 'buttonType',
            label: '按钮类型',
            changeProp: true,
            options: [
              { id: 'button', label: '普通按钮' },
              { id: 'submit', label: '提交按钮' },
              { id: 'reset', label: '重置按钮' },
            ],
          },
        ],
      },
      init(this: any) {
        bindMarkupSync(this, ['buttonText', 'buttonType'], () => `
          <button type="${escapeHtml(this.get('buttonType') || 'submit')}" style="padding:12px 20px;border:none;border-radius:10px;background:#2563eb;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">
            ${escapeHtml(this.get('buttonText') || '提交')}
          </button>
        `);
      },
    },
  });
}

export function registerVisualHtmlComponentTypes(editor: GjsEditor) {
  const registryKey = '__ccuiVisualHtmlComponentTypesRegistered';
  if ((editor as any)[registryKey]) {
    return;
  }

  registerForm(editor);
  registerInput(editor);
  registerTextarea(editor);
  registerSelect(editor);
  registerCheckboxGroup(editor);
  registerRadioGroup(editor);
  registerButton(editor);

  (editor as any)[registryKey] = true;
}
