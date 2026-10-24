import { COMMANDS, type CommandId } from './commands';
import { formatBindingText } from './keys';
import { useKeybindings } from './KeybindingsContext';

/** "Rectangle (R)": label plus the user's current first binding, if any. */
export function useCommandTitle() {
  const { bindings } = useKeybindings();
  return (id: CommandId, label: string = COMMANDS[id].label) => {
    const first = bindings[id][0];
    return first ? `${label} (${formatBindingText(first)})` : label;
  };
}
