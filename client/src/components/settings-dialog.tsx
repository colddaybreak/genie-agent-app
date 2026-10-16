import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@databricks/appkit-ui/react';
import { ExternalLink, Monitor, Moon, Sun } from 'lucide-react';
import { genieAgentConfig, type WorkspaceUser } from '@/lib/api';
import { useTheme, type Theme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: WorkspaceUser | null;
}

const THEME_OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[60%] truncate text-right font-medium">{value}</span>
    </div>
  );
}

export function SettingsDialog({ open, onOpenChange, user }: SettingsDialogProps) {
  const { theme, setTheme } = useTheme();
  const config = genieAgentConfig();

  const initial = (user?.displayName ?? user?.userName ?? '?').slice(0, 1).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Account, appearance, and Genie Agent configuration.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="account">
          <TabsList>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="agent">Genie Agent</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="pt-2">
            <div className="flex items-center gap-3 py-2">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary text-sm text-primary-foreground">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user?.displayName ?? 'Unknown user'}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.userName ?? '—'}</p>
              </div>
            </div>
            <Separator />
            <div className="pt-1">
              <Field label="User ID" value={user?.id ?? '—'} />
              <Field label="Status" value={user?.active === false ? 'Inactive' : 'Active'} />
            </div>
          </TabsContent>

          <TabsContent value="appearance" className="pt-2">
            <p className="pb-2 text-xs text-muted-foreground">
              Theme preference is stored per browser.
            </p>
            <div className="flex gap-2">
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  variant={theme === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTheme(value)}
                  aria-pressed={theme === value}
                >
                  <Icon className="size-4" />
                  {label}
                </Button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="agent" className="pt-2">
            <Field label="Default agent alias" value={config.defaultAlias ?? 'default'} />
            <Field label="Configured aliases" value={(config.aliases ?? []).join(', ') || '—'} />
            <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
              <span className="text-muted-foreground">Runtime mode</span>
              <Badge variant={config.mock ? 'secondary' : 'default'}>
                {config.mock ? 'Mock (scripted)' : 'Live'}
              </Badge>
            </div>
            <p className="pt-2 text-xs text-muted-foreground">
              Mock mode streams scripted Genie Agent responses and needs no credentials — set{' '}
              <code className="rounded bg-muted px-1">GENIE_AGENT_MOCK=false</code> to talk to a live
              workspace.
            </p>
          </TabsContent>

          <TabsContent value="about" className="pt-2">
            <p className="text-sm">
              Genie Agent Console — dashboard and streaming chat for Databricks Genie Agent mode, built
              with Databricks AppKit.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <a
                className={cn('inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-2')}
                href="https://github.com/databricks/appkit"
                target="_blank"
                rel="noopener noreferrer"
              >
                Databricks AppKit on GitHub <ExternalLink className="size-3.5" />
              </a>
              <a
                className={cn('inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-2')}
                href="https://developers.databricks.com/docs/appkit/v0/"
                target="_blank"
                rel="noopener noreferrer"
              >
                AppKit documentation <ExternalLink className="size-3.5" />
              </a>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
