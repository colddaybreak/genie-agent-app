import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
  SidebarTrigger,
  Avatar,
  AvatarFallback,
  Button,
} from '@databricks/appkit-ui/react';
import {
  ChevronsUpDown,
  ExternalLink,
  LayoutDashboard,
  MessageSquare,
  MessagesSquare,
  Monitor,
  Moon,
  Settings,
  Sparkles,
  Sun,
} from 'lucide-react';
import {
  CONVERSATIONS_UPDATED_EVENT,
  defaultAlias,
  genieAgentApi,
  genieAgentConfig,
  workspaceApi,
} from '@/lib/api';
import { useAsyncData } from '@/hooks/use-async-data';
import { useTheme } from '@/hooks/use-theme';
import { SettingsDialog } from './settings-dialog';
import { cn } from '@/lib/utils';

const CONVERSATION_SKELETONS = ['conv-1', 'conv-2', 'conv-3', 'conv-4'];

/**
 * LangBot-style sidebar: primary navigation on top, recent conversations in
 * the middle, and the user menu pinned to the bottom-left corner.
 */
export function AppSidebar() {
  const alias = defaultAlias();
  const config = genieAgentConfig();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const activeConversation = searchParams.get('conversationId');

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { theme, setTheme } = useTheme();

  const { data: user } = useAsyncData(() => workspaceApi.me(), []);
  const { data: conversationsPage, loading: conversationsLoading } = useAsyncData(
    () => genieAgentApi.listConversations(alias, { pageSize: 20 }),
    [alias, refreshKey],
  );

  useEffect(() => {
    const onUpdated = () => setRefreshKey((key) => key + 1);
    window.addEventListener(CONVERSATIONS_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(CONVERSATIONS_UPDATED_EVENT, onUpdated);
  }, []);

  const conversations = (conversationsPage?.conversations ?? []).slice(0, 8);
  const userLabel = user?.displayName ?? user?.userName ?? 'Account';
  const userInitial = userLabel.slice(0, 1).toUpperCase();

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip="Genie Agent Console">
                <Link to="/">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Sparkles className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">Genie Agent</span>
                    <span className="truncate text-xs text-muted-foreground">
                      Databricks AppKit
                    </span>
                  </div>
                  {config.mock && (
                    <Badge variant="secondary" className="text-[10px]">
                      MOCK
                    </Badge>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === '/'}
                    tooltip="Dashboard"
                  >
                    <Link to="/">
                      <LayoutDashboard />
                      <span>Dashboard</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === '/chat' && !activeConversation}
                    tooltip="Genie Chat"
                  >
                    <Link to="/chat">
                      <MessagesSquare />
                      <span>Genie Chat</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Recent conversations</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {conversationsLoading &&
                  CONVERSATION_SKELETONS.map((key) => (
                    <SidebarMenuItem key={key}>
                      <SidebarMenuSkeleton showIcon />
                    </SidebarMenuItem>
                  ))}
                {!conversationsLoading && conversations.length === 0 && (
                  <SidebarMenuItem>
                    <div className="px-2 py-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                      No conversations yet
                    </div>
                  </SidebarMenuItem>
                )}
                {conversations.map((conversation) => (
                  <SidebarMenuItem key={conversation.conversation_id}>
                    <SidebarMenuButton
                      asChild
                      tooltip={conversation.title}
                      isActive={activeConversation === conversation.conversation_id}
                    >
                      <Link to={`/chat?conversationId=${encodeURIComponent(conversation.conversation_id)}`}>
                        <MessageSquare />
                        <span className="truncate">{conversation.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    tooltip={userLabel}
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-primary text-xs text-primary-foreground">
                        {userInitial}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user?.displayName ?? userLabel}</span>
                      {user?.userName && (
                        <span className="text-muted-foreground truncate text-xs">{user.userName}</span>
                      )}
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                  side="right"
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarFallback className="rounded-lg bg-primary text-xs text-primary-foreground">
                          {userInitial}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-medium">{user?.displayName ?? userLabel}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {user?.userName ?? '—'}
                        </span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <div className="flex items-center gap-1 px-1 py-1">
                    {(
                      [
                        { value: 'light' as const, icon: Sun, label: 'Light' },
                        { value: 'dark' as const, icon: Moon, label: 'Dark' },
                        { value: 'system' as const, icon: Monitor, label: 'System' },
                      ]
                    ).map(({ value, icon: Icon, label }) => (
                      <Button
                        key={value}
                        variant={theme === value ? 'default' : 'outline'}
                        size="icon-sm"
                        aria-label={`${label} theme`}
                        aria-pressed={theme === value}
                        onClick={() => setTheme(value)}
                      >
                        <Icon className="size-4" />
                      </Button>
                    ))}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      onClick={() => {
                        setSettingsOpen(true);
                      }}
                    >
                      <Settings />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        window.open('https://developers.databricks.com/docs/appkit/v0/', '_blank')
                      }
                    >
                      <ExternalLink />
                      AppKit documentation
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} user={user ?? null} />
    </>
  );
}

/** Header button that toggles the sidebar (used inside SidebarInset pages). */
export function AppSidebarTrigger({ className }: { className?: string }) {
  return <SidebarTrigger className={cn(className)} />;
}
