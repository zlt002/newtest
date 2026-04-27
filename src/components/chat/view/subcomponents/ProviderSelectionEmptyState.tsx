import React from "react";
import { useTranslation } from "react-i18next";
import SessionProviderLogo from "../../../llm-logo-provider/SessionProviderLogo";
import type { ProjectSession } from "../../../../types/app";
import { getProviderSelectionWelcomeContent } from "./providerSelectionContent";

type ProviderSelectionEmptyStateProps = {
  selectedSession: ProjectSession | null;
  currentSessionId: string | null;
  claudeModel: string;
};

export default function ProviderSelectionEmptyState({
  selectedSession,
  currentSessionId,
  claudeModel,
}: ProviderSelectionEmptyStateProps) {
  const { t } = useTranslation("chat");
  const welcomeContent = getProviderSelectionWelcomeContent(claudeModel);

  if (!selectedSession && !currentSessionId) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="w-full max-w-md text-center">


          <div className="rounded-2xl border border-border/60 bg-card p-6 text-left shadow-sm">
            <div className="flex items-start gap-4">
              <SessionProviderLogo provider="claude" className="h-12 w-12 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold text-foreground">
                 {welcomeContent.title}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {welcomeContent.description}
                </p>
                <div className="mt-4 inline-flex items-center rounded-full bg-muted px-3 py-1.5 text-sm text-foreground">
                  <span className="text-muted-foreground">{welcomeContent.modelLabel}</span>
                  <span className="ml-1 font-medium">{welcomeContent.modelName}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (selectedSession) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md px-6 text-center">
          <p className="mb-1.5 text-lg font-semibold text-foreground">
            {t("session.continue.title")}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("session.continue.description")}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
