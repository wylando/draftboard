// PostToolUse hook: after an edit to a test file, remind Claude to send it through the test-reviewer
// agent. A description saying "use proactively" alone is only a nudge; this makes the step reliable.
// It only adds context and never blocks, so it costs no model call.
import { relative } from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;

const file = JSON.parse(input).tool_input?.file_path ?? '';
if (/\.(cy|test)\.ts$/.test(file)) {
  const path = relative(process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), file);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext:
          `${path} is a test file. Once its tests are written and fail for the right reason, and before ` +
          'implementing against them, run the test-reviewer agent on it and act on its verdict. If you ' +
          `are a subagent and can't start agents, say in your final report that ${path} needs test-reviewer review.`,
      },
    }),
  );
}
