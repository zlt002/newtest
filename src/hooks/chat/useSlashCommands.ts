import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, KeyboardEvent, RefObject, SetStateAction } from 'react';
import Fuse from 'fuse.js';
import { authenticatedFetch } from '@utils/api';
import { safeLocalStorage } from '@components/chat/utils/chatStorage';
import { buildSlashCommandsFromResponse } from './slashCommandData.js';
import { insertSlashCommandIntoInput } from './slashCommandSelection';
import {
  getProjectRequestIdentity,
  resolveProjectRequestName,
  resolveProjectRequestPath,
} from './projectRequestIdentity';
import type { Project } from '@/types/app';

const COMMAND_QUERY_DEBOUNCE_MS = 150;
const COMMAND_CACHE_TTL_MS = 5 * 60 * 1000;
const CLAUDE_SETTINGS_KEY = 'claude-settings';

interface SlashCommandCacheEntry {
  expiresAt: number;
  commands: SlashCommand[];
}

const slashCommandCache = new Map<string, SlashCommandCacheEntry>();
const slashCommandRequests = new Map<string, Promise<SlashCommand[]>>();

export interface SlashCommand {
  name: string;
  description?: string;
  namespace?: string;
  path?: string;
  type?: string;
  sourceType?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface UseSlashCommandsOptions {
  selectedProject: Project | null;
  sessionId?: string | null;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  textareaRef: RefObject<HTMLTextAreaElement>;
}

function readClaudeToolsSettings() {
  const raw = safeLocalStorage.getItem(CLAUDE_SETTINGS_KEY);
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return undefined;
    }

    const allowedTools = Array.isArray(parsed.allowedTools) ? parsed.allowedTools : undefined;
    const disallowedTools = Array.isArray(parsed.disallowedTools) ? parsed.disallowedTools : undefined;
    const skipPermissions = typeof parsed.skipPermissions === 'boolean' ? parsed.skipPermissions : undefined;

    if (!allowedTools && !disallowedTools && skipPermissions === undefined) {
      return undefined;
    }

    return {
      ...(allowedTools ? { allowedTools } : {}),
      ...(disallowedTools ? { disallowedTools } : {}),
      ...(skipPermissions !== undefined ? { skipPermissions } : {}),
    };
  } catch (error) {
    console.error('Error parsing Claude tools settings for slash commands:', error);
    return undefined;
  }
}

const getCommandHistoryKey = (projectName: string) => `command_history_${projectName}`;

const readCommandHistory = (projectName: string): Record<string, number> => {
  const history = safeLocalStorage.getItem(getCommandHistoryKey(projectName));
  if (!history) {
    return {};
  }

  try {
    return JSON.parse(history);
  } catch (error) {
    console.error('Error parsing command history:', error);
    return {};
  }
};

const saveCommandHistory = (projectName: string, history: Record<string, number>) => {
  safeLocalStorage.setItem(getCommandHistoryKey(projectName), JSON.stringify(history));
};

const getSlashCommandCacheKey = ({
  selectedProjectPath,
  sessionId,
  toolsSettings,
}: {
  selectedProjectPath: string;
  sessionId?: string | null;
  toolsSettings?: ReturnType<typeof readClaudeToolsSettings>;
}) => JSON.stringify({ selectedProjectPath, sessionId: sessionId ?? null, toolsSettings: toolsSettings ?? null });

const sortSlashCommandsByHistory = (commands: SlashCommand[], projectName: string) => {
  const parsedHistory = readCommandHistory(projectName);
  return [...commands].sort((commandA, commandB) => {
    const commandAUsage = parsedHistory[commandA.name] || 0;
    const commandBUsage = parsedHistory[commandB.name] || 0;
    return commandBUsage - commandAUsage;
  });
};

const readCachedSlashCommands = (cacheKey: string) => {
  const cachedEntry = slashCommandCache.get(cacheKey);
  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    slashCommandCache.delete(cacheKey);
    return null;
  }

  return cachedEntry.commands;
};

const writeCachedSlashCommands = (cacheKey: string, commands: SlashCommand[]) => {
  slashCommandCache.set(cacheKey, {
    commands,
    expiresAt: Date.now() + COMMAND_CACHE_TTL_MS,
  });
};

const invalidateCachedSlashCommands = (cacheKey: string | null) => {
  if (!cacheKey) {
    return;
  }
  slashCommandCache.delete(cacheKey);
};

export function useSlashCommands({
  selectedProject,
  sessionId,
  input,
  setInput,
  textareaRef,
}: UseSlashCommandsOptions) {
  const selectedProjectRequestKey = getProjectRequestIdentity(selectedProject);
  const selectedProjectName = resolveProjectRequestName(selectedProject);
  const selectedProjectPath = resolveProjectRequestPath(selectedProject);
  const toolsSettings = readClaudeToolsSettings();
  const slashCommandCacheKey = useMemo(() => {
    if (!selectedProjectPath) {
      return null;
    }

    return getSlashCommandCacheKey({
      selectedProjectPath,
      sessionId,
      toolsSettings,
    });
  }, [selectedProjectPath, sessionId, toolsSettings]);
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([]);
  const [filteredCommands, setFilteredCommands] = useState<SlashCommand[]>([]);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(-1);
  const [slashPosition, setSlashPosition] = useState(-1);

  const commandQueryTimerRef = useRef<number | null>(null);

  const clearCommandQueryTimer = useCallback(() => {
    if (commandQueryTimerRef.current !== null) {
      window.clearTimeout(commandQueryTimerRef.current);
      commandQueryTimerRef.current = null;
    }
  }, []);

  const resetCommandMenuState = useCallback(() => {
    setShowCommandMenu(false);
    setSlashPosition(-1);
    setCommandQuery('');
    setSelectedCommandIndex(-1);
    clearCommandQueryTimer();
  }, [clearCommandQueryTimer]);

  const ensureSlashCommandsLoaded = useCallback(async () => {
    if (!selectedProjectName || !selectedProjectPath || !slashCommandCacheKey) {
      setSlashCommands([]);
      setFilteredCommands([]);
      return [];
    }

    const cachedCommands = readCachedSlashCommands(slashCommandCacheKey);
    if (cachedCommands) {
      const sortedCachedCommands = sortSlashCommandsByHistory(cachedCommands, selectedProjectName);
      setSlashCommands(sortedCachedCommands);
      return sortedCachedCommands;
    }

    const existingRequest = slashCommandRequests.get(slashCommandCacheKey);
    if (existingRequest) {
      try {
        const commands = await existingRequest;
        const sortedCommands = sortSlashCommandsByHistory(commands, selectedProjectName);
        setSlashCommands(sortedCommands);
        return sortedCommands;
      } catch (error) {
        console.error('Error fetching slash commands:', error);
        setSlashCommands([]);
        return [];
      }
    }

    const request = (async () => {
      const response = await authenticatedFetch('/api/commands/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectPath: selectedProjectPath,
          sessionId,
          toolsSettings,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch commands');
      }

      const data = await response.json();
      const commands = buildSlashCommandsFromResponse(data) as SlashCommand[];
      writeCachedSlashCommands(slashCommandCacheKey, commands);
      return commands;
    })();

    slashCommandRequests.set(slashCommandCacheKey, request);

    try {
      const commands = await request;
      const sortedCommands = sortSlashCommandsByHistory(commands, selectedProjectName);
      setSlashCommands(sortedCommands);
      return sortedCommands;
    } catch (error) {
      console.error('Error fetching slash commands:', error);
      setSlashCommands([]);
      return [];
    } finally {
      slashCommandRequests.delete(slashCommandCacheKey);
    }
  }, [selectedProjectName, selectedProjectPath, sessionId, slashCommandCacheKey, toolsSettings]);

  const refreshSlashCommands = useCallback(async () => {
    invalidateCachedSlashCommands(slashCommandCacheKey);
    slashCommandRequests.delete(slashCommandCacheKey || '');
    return await ensureSlashCommandsLoaded();
  }, [ensureSlashCommandsLoaded, slashCommandCacheKey]);

  useEffect(() => {
    if (!selectedProjectName || !selectedProjectPath || !slashCommandCacheKey) {
      setSlashCommands([]);
      setFilteredCommands([]);
      return;
    }

    const cachedCommands = readCachedSlashCommands(slashCommandCacheKey);
    if (!cachedCommands) {
      setSlashCommands([]);
      setFilteredCommands([]);
      return;
    }

    setSlashCommands(sortSlashCommandsByHistory(cachedCommands, selectedProjectName));
  }, [selectedProjectName, selectedProjectPath, selectedProjectRequestKey, slashCommandCacheKey]);

  useEffect(() => {
    if (!showCommandMenu) {
      setSelectedCommandIndex(-1);
    }
  }, [showCommandMenu]);

  const fuse = useMemo(() => {
    if (!slashCommands.length) {
      return null;
    }

    return new Fuse(slashCommands, {
      keys: [
        { name: 'name', weight: 2 },
        { name: 'metadata.searchTokens', weight: 1.5 },
        { name: 'description', weight: 1 },
      ],
      threshold: 0.4,
      includeScore: true,
      minMatchCharLength: 1,
    });
  }, [slashCommands]);

  useEffect(() => {
    if (!commandQuery) {
      setFilteredCommands(slashCommands);
      return;
    }

    if (!fuse) {
      setFilteredCommands([]);
      return;
    }

    const results = fuse.search(commandQuery);
    setFilteredCommands(results.map((result) => result.item));
  }, [commandQuery, slashCommands, fuse]);

  const frequentCommands = useMemo(() => {
    if (!selectedProjectName || slashCommands.length === 0) {
      return [];
    }

    const parsedHistory = readCommandHistory(selectedProjectName);

    return slashCommands
      .map((command) => ({
        ...command,
        usageCount: parsedHistory[command.name] || 0,
      }))
      .filter((command) => command.usageCount > 0)
      .sort((commandA, commandB) => commandB.usageCount - commandA.usageCount)
      .slice(0, 5);
  }, [selectedProjectName, slashCommands]);

  const trackCommandUsage = useCallback(
    (command: SlashCommand) => {
      if (!selectedProjectName) {
        return;
      }

      const parsedHistory = readCommandHistory(selectedProjectName);
      parsedHistory[command.name] = (parsedHistory[command.name] || 0) + 1;
      saveCommandHistory(selectedProjectName, parsedHistory);
    },
    [selectedProjectName],
  );

  const selectCommandFromKeyboard = useCallback(
    (command: SlashCommand) => {
      const newInput = insertSlashCommandIntoInput(input, slashPosition, command.name);

      setInput(newInput);
      resetCommandMenuState();
      textareaRef.current?.focus();
    },
    [input, slashPosition, setInput, resetCommandMenuState, textareaRef],
  );

  const handleCommandSelect = useCallback(
    (command: SlashCommand | null, index: number, isHover: boolean) => {
      if (!command || !selectedProjectName) {
        return;
      }

      if (isHover) {
        setSelectedCommandIndex(index);
        return;
      }

      trackCommandUsage(command);
      const newInput = insertSlashCommandIntoInput(input, slashPosition, command.name);
      setInput(newInput);
      resetCommandMenuState();
      textareaRef.current?.focus();
    },
    [selectedProjectName, trackCommandUsage, input, slashPosition, setInput, resetCommandMenuState, textareaRef],
  );

  const handleToggleCommandMenu = useCallback(() => {
    const isOpening = !showCommandMenu;
    setShowCommandMenu(isOpening);
    setCommandQuery('');
    setSelectedCommandIndex(-1);

    if (isOpening) {
      void (sessionId ? refreshSlashCommands() : ensureSlashCommandsLoaded());
      setFilteredCommands(slashCommands);
    }

    textareaRef.current?.focus();
  }, [ensureSlashCommandsLoaded, refreshSlashCommands, sessionId, showCommandMenu, slashCommands, textareaRef]);

  const handleCommandInputChange = useCallback(
    (newValue: string, cursorPos: number) => {
      if (!newValue.trim()) {
        resetCommandMenuState();
        return;
      }

      const textBeforeCursor = newValue.slice(0, cursorPos);
      const backticksBefore = (textBeforeCursor.match(/```/g) || []).length;
      const inCodeBlock = backticksBefore % 2 === 1;

      if (inCodeBlock) {
        resetCommandMenuState();
        return;
      }

      const slashPattern = /(^|\s)\/(\S*)$/;
      const match = textBeforeCursor.match(slashPattern);

      if (!match) {
        resetCommandMenuState();
        return;
      }

      if (match) {
        void (sessionId ? refreshSlashCommands() : ensureSlashCommandsLoaded());
      }

      const slashPos = (match.index || 0) + match[1].length;
      const query = match[2];

      setSlashPosition(slashPos);
      setShowCommandMenu(true);
      setSelectedCommandIndex(-1);

      clearCommandQueryTimer();
      commandQueryTimerRef.current = window.setTimeout(() => {
        setCommandQuery(query);
      }, COMMAND_QUERY_DEBOUNCE_MS);
    },
    [ensureSlashCommandsLoaded, refreshSlashCommands, sessionId, resetCommandMenuState, clearCommandQueryTimer],
  );

  const handleCommandMenuKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!showCommandMenu) {
        return false;
      }

      if (!filteredCommands.length) {
        if (event.key === 'Escape') {
          event.preventDefault();
          resetCommandMenuState();
          return true;
        }
        return false;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedCommandIndex((previousIndex) =>
          previousIndex < filteredCommands.length - 1 ? previousIndex + 1 : 0,
        );
        return true;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedCommandIndex((previousIndex) =>
          previousIndex > 0 ? previousIndex - 1 : filteredCommands.length - 1,
        );
        return true;
      }

      if (event.key === 'Tab' || event.key === 'Enter') {
        event.preventDefault();
        if (selectedCommandIndex >= 0) {
          selectCommandFromKeyboard(filteredCommands[selectedCommandIndex]);
        } else if (filteredCommands.length > 0) {
          selectCommandFromKeyboard(filteredCommands[0]);
        }
        return true;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        resetCommandMenuState();
        return true;
      }

      return false;
    },
    [showCommandMenu, filteredCommands, resetCommandMenuState, selectCommandFromKeyboard, selectedCommandIndex],
  );

  useEffect(
    () => () => {
      clearCommandQueryTimer();
    },
    [clearCommandQueryTimer],
  );

  return {
    slashCommands,
    slashCommandsCount: slashCommands.length,
    filteredCommands,
    frequentCommands,
    commandQuery,
    showCommandMenu,
    selectedCommandIndex,
    resetCommandMenuState,
    handleCommandSelect,
    handleToggleCommandMenu,
    handleCommandInputChange,
    handleCommandMenuKeyDown,
  };
}
