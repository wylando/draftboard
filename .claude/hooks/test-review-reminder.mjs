// PostToolUse hook: after an edit to a test file or Cypress support file, remind Claude to send it
// through the test-reviewer agent. A description saying "use proactively" alone is only a nudge; this
// makes the step reliable. It only adds context and never blocks, so it costs no model call.
import { appendFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;

let event;
try {
  event = JSON.parse(input);
} catch {
  process.exit(0);
}

const file = event.tool_input?.file_path ?? '';
const path = relative(process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), file);
if (!/\.(cy|test)\.tsx?$/.test(path) && !path.startsWith('cypress/support/')) process.exit(0);

// Once per file per session: the hook fires on every edit, and repeating it mid-iteration is noise.
const seen = join(tmpdir(), `draftboard-test-review-${event.session_id ?? 'unknown'}`);
let reminded = '';
try {
  reminded = readFileSync(seen, 'utf8');
} catch {
  // first reminder this session
}
if (reminded.split('\n').includes(path)) process.exit(0);
appendFileSync(seen, `${path}\n`);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext:
        `${path} is test code. Run the test-reviewer agent on it once its new tests are written and fail for ` +
        'the right reason (before implementing), and again once they pass (burn-in). If you are a subagent ' +
        `and can't start agents, say in your final report that ${path} needs test-reviewer review.`,
    },
  }),
);
