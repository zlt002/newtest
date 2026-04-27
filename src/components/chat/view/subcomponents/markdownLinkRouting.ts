type MarkdownLinkAttributes = {
  shouldRouteToRightPane: boolean;
  target?: '_blank';
  rel?: 'noopener noreferrer';
};

type GetMarkdownLinkAttributesParams = {
  href?: string;
  onOpenUrl?: ((url: string) => void) | null;
};

export function shouldRouteLinkToRightPane(href?: string): boolean {
  if (!href) {
    return false;
  }

  const trimmedHref = href.trim();

  if (!trimmedHref) {
    return false;
  }

  if (/^(mailto|javascript|tel):/i.test(trimmedHref)) {
    return false;
  }

  if (trimmedHref.startsWith('#') || trimmedHref.startsWith('/')) {
    return false;
  }

  return /^(https?:\/\/|localhost(?::\d+)?(?:\/.*)?$|127\.0\.0\.1(?::\d+)?(?:\/.*)?$)/i.test(trimmedHref);
}

export function getMarkdownLinkAttributes({
  href,
  onOpenUrl,
}: GetMarkdownLinkAttributesParams): MarkdownLinkAttributes {
  const shouldRouteToRightPane = Boolean(onOpenUrl) && shouldRouteLinkToRightPane(href);

  if (shouldRouteToRightPane) {
    return {
      shouldRouteToRightPane: true,
      target: undefined,
      rel: undefined,
    };
  }

  return {
    shouldRouteToRightPane: false,
    target: '_blank',
    rel: 'noopener noreferrer',
  };
}
