import type { RunCard as RunCardModel } from '../types/runCard.ts';

function normalizeComparableText(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildHistoricalCardMap(historicalRunCards: RunCardModel[]) {
  const byAnchorMessageId = new Map<string, RunCardModel>();

  for (const card of historicalRunCards) {
    const anchorMessageId = String(card.anchorMessageId || '').trim();
    if (!anchorMessageId) {
      continue;
    }

    byAnchorMessageId.set(anchorMessageId, card);
  }

  return byAnchorMessageId;
}

function historyCardCoversLiveCard(historicalCard: RunCardModel | null | undefined, liveCard: RunCardModel) {
  if (!historicalCard) {
    return false;
  }

  const liveFinalResponse = normalizeComparableText(liveCard.finalResponse);
  const historicalFinalResponse = normalizeComparableText(historicalCard.finalResponse);
  if (liveFinalResponse && historicalFinalResponse !== liveFinalResponse) {
    return false;
  }

  const liveResponseCount = Array.isArray(liveCard.responseMessages) ? liveCard.responseMessages.length : 0;
  const historicalResponseCount = Array.isArray(historicalCard.responseMessages) ? historicalCard.responseMessages.length : 0;
  if (historicalResponseCount < liveResponseCount) {
    return false;
  }

  const liveProcessCount = Array.isArray(liveCard.processItems) ? liveCard.processItems.length : 0;
  const historicalProcessCount = Array.isArray(historicalCard.processItems) ? historicalCard.processItems.length : 0;
  if (historicalProcessCount < liveProcessCount) {
    return false;
  }

  if (liveCard.activeInteraction && !historicalCard.activeInteraction) {
    return false;
  }

  return true;
}

export function historicalRunCardsCoverLiveRunCards(
  historicalRunCards: RunCardModel[],
  liveRunCards: RunCardModel[],
) {
  if (liveRunCards.length === 0) {
    return true;
  }

  const historicalByAnchorMessageId = buildHistoricalCardMap(historicalRunCards);

  for (const liveCard of liveRunCards) {
    const anchorMessageId = String(liveCard.anchorMessageId || '').trim();
    if (!anchorMessageId) {
      return false;
    }

    const historicalCard = historicalByAnchorMessageId.get(anchorMessageId);
    if (!historyCardCoversLiveCard(historicalCard, liveCard)) {
      return false;
    }
  }

  return true;
}
