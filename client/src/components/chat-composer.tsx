import { useState } from 'react';
import { Button, Textarea } from '@databricks/appkit-ui/react';
import { CornerDownLeft, Send, Square } from 'lucide-react';

interface ChatComposerProps {
  busy: boolean;
  cancelling: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
  placeholder?: string;
}

export function ChatComposer({ busy, cancelling, onSend, onCancel, placeholder }: ChatComposerProps) {
  const [value, setValue] = useState('');

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setValue('');
    onSend(trimmed);
  };

  return (
    <div className="rounded-xl border bg-card p-2 shadow-sm">
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder ?? 'Ask a question about your data…'}
        rows={2}
        className="resize-none border-0 shadow-none focus-visible:ring-0"
        disabled={cancelling}
      />
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <CornerDownLeft className="size-3" />
          Enter to send · Shift+Enter for a new line
        </span>
        {busy ? (
          <Button variant="outline" size="sm" onClick={onCancel} disabled={cancelling}>
            <Square className="size-3.5 fill-current" />
            {cancelling ? 'Stopping…' : 'Stop'}
          </Button>
        ) : (
          <Button size="sm" onClick={submit} disabled={!value.trim()}>
            <Send className="size-3.5" />
            Send
          </Button>
        )}
      </div>
    </div>
  );
}
