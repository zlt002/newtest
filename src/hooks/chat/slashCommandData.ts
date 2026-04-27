interface SlashCommandItem {
  name?: string;
  description?: string;
  metadata?: Record<string, unknown> & {
    type?: string;
    group?: string;
    skillName?: string;
  };
  [key: string]: unknown;
}

interface SlashCommandData {
  localUi?: SlashCommandItem[];
  runtime?: SlashCommandItem[];
  skills?: (SlashCommandItem | string)[];
}

interface NormalizedSlashCommandData {
  localUi: SlashCommandItem[];
  runtime: SlashCommandItem[];
  skills: SlashCommandItem[];
}

interface SlashCommandOutput extends SlashCommandItem {
  type: string;
  sourceType: string;
}

function buildSearchTokens(name: string | undefined): string[] {
  const normalizedName = normalizeCommandName(name);
  if (!normalizedName) {
    return [];
  }

  const tokens = new Set([normalizedName]);
  const colonParts = normalizedName.split(':').map((part) => part.trim()).filter(Boolean);
  const slashParts = normalizedName.split('/').map((part) => part.trim()).filter(Boolean);

  if (colonParts.length > 1) {
    tokens.add(colonParts[colonParts.length - 1]);
    tokens.add(colonParts.join(' '));
  }

  if (slashParts.length > 1) {
    tokens.add(slashParts[slashParts.length - 1]);
    tokens.add(slashParts.join(' '));
  }

  return [...tokens];
}

function normalizeCommandList(commands: SlashCommandItem[] | undefined): SlashCommandItem[] {
  return Array.isArray(commands) ? commands : [];
}

function normalizeCommandName(name: string | undefined): string {
  return typeof name === 'string' ? name.trim().replace(/^\//, '') : '';
}

function normalizeSkillList(skills: (SlashCommandItem | string)[] | undefined): SlashCommandItem[] {
  return (Array.isArray(skills) ? skills : [])
    .map((skill): SlashCommandItem | null => {
      if (typeof skill === 'string') {
        const name = skill.trim();
        return name ? { name } : null;
      }
      if (!skill || typeof skill !== 'object') {
        return null;
      }
      const name = typeof skill.name === 'string' ? skill.name.trim() : '';
      if (!name) {
        return null;
      }
      return {
        ...skill,
        name,
      };
    })
    .filter(Boolean) as SlashCommandItem[];
}

export function normalizeSlashCommandData(data: SlashCommandData = {}): NormalizedSlashCommandData {
  return {
    localUi: normalizeCommandList(data.localUi),
    runtime: normalizeCommandList(data.runtime),
    skills: normalizeSkillList(data.skills),
  };
}

function isLikelyRuntimeSkill(command: SlashCommandItem, knownSkillNames: Set<string>): boolean {
  const normalizedName = normalizeCommandName(command?.name);
  if (normalizedName && knownSkillNames.has(normalizedName)) {
    return true;
  }

  if (command?.metadata?.type === 'skill' || command?.metadata?.group === 'skills') {
    return true;
  }

  const description = String(command?.description || '').trim();
  if (!description) {
    return false;
  }

  return /\(user\)\s*$/i.test(description) || /^use this skill\b/i.test(description);
}

export function buildSlashCommandsFromResponse(data: SlashCommandData = {}): SlashCommandOutput[] {
  const normalized = normalizeSlashCommandData(data);
  const knownSkillNames = new Set(
    normalized.skills
      .map((skill) => normalizeCommandName(skill.name))
      .filter(Boolean),
  );
  const runtimeCommandNames = new Set<string>();

  return [
    ...normalized.localUi.map((command) => ({
      ...command,
      type: 'local-ui',
      sourceType: 'local-ui',
    })),
    ...normalized.runtime.map((command) => {
      const normalizedName = normalizeCommandName(command?.name);
      if (normalizedName) {
        runtimeCommandNames.add(normalizedName);
      }

      const runtimeSkill = isLikelyRuntimeSkill(command, knownSkillNames);

      return {
        ...command,
        type: 'claude-runtime',
        sourceType: 'claude-runtime',
        metadata: runtimeSkill
          ? {
              ...(command.metadata && typeof command.metadata === 'object' ? command.metadata : {}),
              type: 'skill',
              group: 'skills',
              skillName: normalizedName || command.name,
              searchTokens: buildSearchTokens(command.name),
            }
          : {
              ...(command.metadata && typeof command.metadata === 'object' ? command.metadata : {}),
              searchTokens: buildSearchTokens(command.name),
            },
      };
    }),
    ...normalized.skills.map((skill) => ({
      ...skill,
      name: skill.name!.startsWith('/') ? skill.name : `/${skill.name}`,
      type: 'claude-runtime',
      sourceType: 'claude-runtime',
      metadata: {
        ...(skill.metadata && typeof skill.metadata === 'object' ? skill.metadata : {}),
        type: 'skill',
        group: 'skills',
        skillName: skill.name,
        searchTokens: buildSearchTokens(skill.name),
      },
    })).filter((skill) => !runtimeCommandNames.has(normalizeCommandName(skill.name))),
  ] as SlashCommandOutput[];
}
