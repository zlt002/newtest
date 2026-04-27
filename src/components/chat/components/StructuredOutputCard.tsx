import React, { useMemo, useState } from 'react';

type StructuredOutputCardProps = {
  value: unknown;
  isError?: boolean;
};

function formatStructuredOutput(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function StructuredOutputCard({
  value,
  isError = false,
}: StructuredOutputCardProps) {
  const [copied, setCopied] = useState(false);
  const formatted = useMemo(() => formatStructuredOutput(value), [value]);

  return (
    <div
      data-structured-output-card="true"
      className={`my-3 overflow-hidden rounded-xl border shadow-sm ${
        isError
          ? 'border-red-200 bg-red-50'
          : 'border-sky-200 bg-sky-50'
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-current/10 px-4 py-3">
        <div className="text-sm font-semibold text-neutral-900">
          {isError ? '结构化输出错误' : '结构化输出'}
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(formatted);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            } catch {
              setCopied(false);
            }
          }}
          className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
        >
          {copied ? '已复制' : '复制 JSON'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-6 text-neutral-900">
        <code>{formatted}</code>
      </pre>
    </div>
  );
}

export default StructuredOutputCard;
