/**
 * Slash commands the wizard assistant understands.
 *
 * `/sdrf-annotate PXD000547` expands into a concrete annotation request and
 * tells the backend to load the matching skill instructions.
 */

export interface SlashCommand {
  name: string;
  args: string;
  accession: string | null;
  /** Text shown in the transcript chip. */
  label: string;
  /** Prompt body sent to the model. */
  prompt: string;
}

const SLASH_RE = /^\/(sdrf-annotate|sdrf:annotate)(?:\s+(.+))?\s*$/i;
const PXD_RE = /\b(PXD\d+)\b/i;

/** Parse a known slash command, or null if the text is ordinary chat. */
export function parseSlashCommand(text: string): SlashCommand | null {
  const match = SLASH_RE.exec(text.trim());
  if (!match) return null;

  const name = match[1].toLowerCase().replace(':', '-');
  const args = (match[2] || '').trim();
  const accessionMatch = PXD_RE.exec(args);
  const accession = accessionMatch ? accessionMatch[1].toUpperCase() : null;

  if (name !== 'sdrf-annotate') return null;

  const prompt = accession
    ? `Run the sdrf-annotate skill for ${accession}. Fetch PRIDE metadata and the paper, then ` +
      `propose wizard actions for the page I am on.`
    : `Run the sdrf-annotate skill. Ask me for a ProteomeXchange accession if none was ` +
      `provided, then annotate the current wizard page.`;

  return {
    name: 'sdrf-annotate',
    args,
    accession,
    label: accession ? `/sdrf-annotate ${accession}` : '/sdrf-annotate',
    prompt,
  };
}

/** Known commands shown when the user types `/` in the composer. */
export const SLASH_COMMAND_HINTS = [
  {
    command: '/sdrf-annotate',
    hint: 'Annotate a PXD dataset into this wizard',
    example: '/sdrf-annotate PXD000547',
  },
] as const;
