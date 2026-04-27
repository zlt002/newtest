type ContainsTarget = {
  contains: (node: Node | null) => boolean;
} | null;

export function shouldDismissThinkingModeMenu({
  target,
  triggerContainer,
  menuContainer,
}: {
  target: EventTarget | null;
  triggerContainer: ContainsTarget;
  menuContainer: ContainsTarget;
}): boolean {
  const nodeTarget = (target && typeof target === 'object') ? (target as Node) : null;

  if (triggerContainer?.contains(nodeTarget) || menuContainer?.contains(nodeTarget)) {
    return false;
  }

  return true;
}
