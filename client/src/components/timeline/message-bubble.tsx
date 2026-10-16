import { Avatar, AvatarFallback, Card } from '@databricks/appkit-ui/react';
import { Markdown } from '@/components/markdown';
import type { MessageItem } from '@/lib/genie-types';
import { messageText } from '@/lib/genie-types';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  item: MessageItem;
  running: boolean;
}

/** User/assistant conversation bubble, styled like the official GenieChatMessage. */
export function MessageBubble({ item, running }: MessageBubbleProps) {
  const isUser = item.role === 'user';
  const text = messageText(item);

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <Avatar className="mt-1 h-8 w-8 shrink-0">
        <AvatarFallback
          className={cn(
            'text-xs font-medium',
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
          )}
        >
          {isUser ? 'You' : 'AI'}
        </AvatarFallback>
      </Avatar>
      <div className={cn('flex max-w-[80%] min-w-0 flex-col gap-2', isUser && 'items-end')}>
        <Card
          className={cn(
            'w-fit max-w-full overflow-hidden px-4 py-3',
            isUser
              ? 'bg-primary text-primary-foreground [&_*::selection]:bg-primary-foreground/30'
              : 'bg-muted',
          )}
        >
          {text ? (
            isUser ? (
              <p className="text-sm break-words whitespace-pre-wrap">{text}</p>
            ) : (
              <Markdown content={text} />
            )
          ) : running ? (
            <TypingDots />
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-1" aria-label="Generating response">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}
