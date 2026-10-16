import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { cn } from '@/lib/utils';

/**
 * Same approach as the official `GenieChatMessage` in appkit-ui: `marked`
 * for GFM (tables included) + DOMPurify before `dangerouslySetInnerHTML`.
 * Adds a sanitizer hook that hardens links and clamps media width.
 */

marked.setOptions({ breaks: true, gfm: true });

let hooksInstalled = false;
function installSanitizerHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node instanceof Element && node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

const markdownStyles = cn(
  'text-sm break-words min-w-0',
  '[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
  '[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
  '[&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1',
  '[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1',
  '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1',
  '[&_pre]:bg-background/60 [&_pre]:p-2 [&_pre]:rounded [&_pre]:text-xs [&_pre]:overflow-x-auto',
  '[&_code]:text-xs [&_code]:bg-background/60 [&_code]:px-1 [&_code]:rounded',
  '[&_table]:text-xs [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full',
  '[&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1',
  '[&_table]:border-collapse [&_th]:border [&_td]:border',
  '[&_th]:border-border [&_td]:border-border',
  '[&_img]:max-w-full [&_img]:rounded-md [&_img]:my-2',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_blockquote]:my-2',
  '[&_a]:underline [&_a]:underline-offset-2 [&_a]:text-primary',
  '[&_hr]:my-3 [&_hr]:border-border',
);

export function Markdown({ content, className }: { content: string; className?: string }) {
  installSanitizerHooks();
  const html = useMemo(
    () => (content ? DOMPurify.sanitize(marked.parse(content) as string) : ''),
    [content],
  );
  if (!html) return null;
  return <div className={cn(markdownStyles, className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
