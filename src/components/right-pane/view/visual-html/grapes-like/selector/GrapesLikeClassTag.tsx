type GrapesLikeClassTagProps = {
  name: string;
  onRemove: (name: string) => void;
};

export default function GrapesLikeClassTag({ name, onRemove }: GrapesLikeClassTagProps) {
  return (
    <button
      type="button"
      className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-xs leading-4 text-foreground transition-colors hover:bg-accent"
      onClick={() => {
        onRemove(name);
      }}
    >
      <span className="max-w-[150px] whitespace-normal break-words">{name}</span>
      <span aria-hidden="true" className="text-[10px] leading-none">
        ×
      </span>
    </button>
  );
}
