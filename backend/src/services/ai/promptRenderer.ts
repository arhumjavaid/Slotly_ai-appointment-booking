import path from 'node:path';
import nunjucks from 'nunjucks';

/**
 * Renders the `.jinja` prompt templates that live beside this module.
 *
 * Prompts are treated as versioned server-side assets rather than string
 * literals buried in TypeScript: they can be reviewed and edited without
 * touching application logic, and they never leave the server.
 *
 * `autoescape` is off because the output is plain text for a model, not HTML —
 * escaping would corrupt quotes in the JSON examples. Dynamic values are passed
 * as template variables, never concatenated into the template source.
 */
const environment = new nunjucks.Environment(
  new nunjucks.FileSystemLoader(path.join(__dirname, '../../prompts'), {
    noCache: process.env.NODE_ENV === 'development',
  }),
  { autoescape: false, trimBlocks: true, lstripBlocks: false },
);

export type PromptName =
  | 'system_prompt.jinja'
  | 'appointment_extraction.jinja'
  | 'clarification.jinja';

export function renderPrompt(name: PromptName, context: Record<string, unknown>): string {
  return environment.render(name, context).trim();
}
