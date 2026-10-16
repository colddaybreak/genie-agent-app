import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@databricks/appkit-ui/react';
import {
  ArrowRight,
  Database,
  FolderTree,
  Layers,
  MessagesSquare,
  Plus,
  Table2,
} from 'lucide-react';
import {
  CONVERSATIONS_UPDATED_EVENT,
  defaultAlias,
  genieAgentApi,
  genieAgentConfig,
  workspaceApi,
} from '@/lib/api';
import { useAsyncData } from '@/hooks/use-async-data';
import { relativeTime } from '@/lib/format';
import { Markdown } from '@/components/markdown';
import { AppSidebarTrigger } from '@/components/app-sidebar';
import type { MessageItem } from '@/lib/genie-types';
import { messageText } from '@/lib/genie-types';

const TABLE_SKELETON_KEYS = ['tbl-1', 'tbl-2', 'tbl-3', 'tbl-4', 'tbl-5'];
const CONVERSATION_SKELETON_KEYS = ['conv-1', 'conv-2', 'conv-3', 'conv-4'];

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  loading,
}: {
  title: string;
  value: string;
  hint: string;
  icon: typeof Database;
  loading: boolean;
}) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4">
        <CardDescription className="flex items-center gap-2 text-xs">
          <Icon className="size-3.5" />
          {title}
        </CardDescription>
        <CardTitle className="text-2xl">
          {loading ? <Skeleton className="h-7 w-12" /> : value}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function tableTypeVariant(tableType?: string): 'default' | 'secondary' | 'outline' {
  if (!tableType) return 'outline';
  return tableType === 'MANAGED' ? 'secondary' : 'outline';
}

export function DashboardPage() {
  const alias = defaultAlias();
  const config = genieAgentConfig();

  const { data: catalogs, loading: catalogsLoading } = useAsyncData(
    () => workspaceApi.listCatalogs(),
    [],
  );
  // `null` means "no explicit choice yet" — fall back to the first entry.
  const [catalogChoice, setCatalogChoice] = useState<string | null>(null);
  const catalog = catalogChoice ?? catalogs?.[0]?.name ?? null;

  const { data: schemas, loading: schemasLoading } = useAsyncData(
    () => (catalog ? workspaceApi.listSchemas(catalog) : Promise.resolve([])),
    [catalog],
  );
  const [schemaChoice, setSchemaChoice] = useState<string | null>(null);
  const schema = useMemo(() => {
    if (!schemas || schemas.length === 0) return null;
    if (schemaChoice && schemas.some((entry) => entry.name === schemaChoice)) return schemaChoice;
    return schemas[0].name;
  }, [schemas, schemaChoice]);

  const { data: tables, loading: tablesLoading } = useAsyncData(
    () => (catalog && schema ? workspaceApi.listTables(catalog, schema) : Promise.resolve([])),
    [catalog, schema],
  );

  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const onUpdated = () => setRefreshKey((key) => key + 1);
    window.addEventListener(CONVERSATIONS_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(CONVERSATIONS_UPDATED_EVENT, onUpdated);
  }, []);

  const { data: conversationsPage, loading: conversationsLoading } = useAsyncData(
    () => genieAgentApi.listConversations(alias, { pageSize: 20 }),
    [alias, refreshKey],
  );
  const conversations = conversationsPage?.conversations ?? [];
  const lastConversation = conversations[0];

  const { data: lastItems, loading: lastItemsLoading } = useAsyncData(
    () =>
      lastConversation
        ? genieAgentApi.getAllConversationItems(alias, lastConversation.conversation_id)
        : Promise.resolve([]),
    [alias, lastConversation?.conversation_id],
  );

  const lastExchange = useMemo(() => {
    const items = lastItems ?? [];
    const lastUser = [...items]
      .reverse()
      .find((item): item is MessageItem => item.type === 'message' && item.role === 'user');
    const lastAssistant = [...items]
      .reverse()
      .find((item): item is MessageItem => item.type === 'message' && item.role === 'assistant');
    return {
      question: lastUser ? messageText(lastUser) : null,
      answer: lastAssistant ? messageText(lastAssistant) : null,
    };
  }, [lastItems]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <AppSidebarTrigger />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">Dashboard</h1>
              {config.mock && <Badge variant="secondary">MOCK MODE</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Workspace data overview and Genie Agent conversation history.
            </p>
          </div>
        </div>
        <Button asChild>
          <Link to="/chat">
            <Plus className="size-4" />
            New conversation
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Catalogs"
          value={catalogs ? String(catalogs.length) : '—'}
          hint="Unity Catalog catalogs visible to you"
          icon={Layers}
          loading={catalogsLoading}
        />
        <StatCard
          title="Schemas"
          value={schemas ? String(schemas.length) : '—'}
          hint={catalog ? `in ${catalog}` : 'Select a catalog'}
          icon={FolderTree}
          loading={schemasLoading}
        />
        <StatCard
          title="Tables"
          value={tables ? String(tables.length) : '—'}
          hint={catalog && schema ? `${catalog}.${schema}` : 'Select a schema'}
          icon={Table2}
          loading={tablesLoading}
        />
        <StatCard
          title="Conversations"
          value={conversationsPage ? String(conversations.length) : '—'}
          hint={
            conversationsPage?.next_page_token
              ? 'More available in the sidebar'
              : 'Genie Agent sessions'
          }
          icon={MessagesSquare}
          loading={conversationsLoading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="min-w-0">
          <CardHeader className="px-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="size-4" />
              Data explorer
            </CardTitle>
            <CardDescription>
              Catalogs, schemas, and tables backing this Genie Agent.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-3 px-4">
            <div className="flex flex-wrap gap-2">
              <Select
                value={catalog ?? undefined}
                onValueChange={(value) => {
                  setCatalogChoice(value);
                  setSchemaChoice(null);
                }}
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder={catalogsLoading ? 'Loading catalogs…' : 'Select catalog'} />
                </SelectTrigger>
                <SelectContent>
                  {(catalogs ?? []).map((entry) => (
                    <SelectItem key={entry.name} value={entry.name}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={schema ?? undefined} onValueChange={setSchemaChoice} disabled={!catalog}>
                <SelectTrigger className="w-56">
                  <SelectValue
                    placeholder={schemasLoading ? 'Loading schemas…' : 'Select schema'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(schemas ?? []).map((entry) => (
                    <SelectItem key={entry.name} value={entry.name}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {tablesLoading ? (
              <div className="flex flex-col gap-2">
                {TABLE_SKELETON_KEYS.map((key) => (
                  <Skeleton key={key} className="h-8 w-full" />
                ))}
              </div>
            ) : (tables ?? []).length === 0 ? (
              <Empty className="py-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Table2 />
                  </EmptyMedia>
                  <EmptyTitle>No tables</EmptyTitle>
                  <EmptyDescription>
                    This schema has no tables visible to the current user.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ScrollArea className="max-h-[22rem] rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted">
                    <TableRow>
                      <TableHead>Table</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="hidden md:table-cell">Comment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(tables ?? []).map((table) => (
                      <TableRow key={table.name}>
                        <TableCell className="font-mono text-xs">{table.name}</TableCell>
                        <TableCell>
                          <Badge variant={tableTypeVariant(table.tableType)} className="text-[10px]">
                            {table.tableType ?? 'UNKNOWN'}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden max-w-[24rem] truncate text-xs text-muted-foreground md:table-cell">
                          {table.comment ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="min-w-0">
            <CardHeader className="px-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessagesSquare className="size-4" />
                Recent conversations
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              {conversationsLoading ? (
                <div className="flex flex-col gap-2">
                  {CONVERSATION_SKELETON_KEYS.map((key) => (
                    <Skeleton key={key} className="h-9 w-full" />
                  ))}
                </div>
              ) : conversations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No conversations yet.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {conversations.slice(0, 6).map((conversation) => (
                    <li key={conversation.conversation_id}>
                      <Link
                        to={`/chat?conversationId=${encodeURIComponent(conversation.conversation_id)}`}
                        className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted"
                      >
                        <span className="truncate text-sm font-medium">{conversation.title}</span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="truncate">{conversation.last_message_preview || '—'}</span>
                          <span className="ml-auto shrink-0">
                            {relativeTime(conversation.created_timestamp)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader className="px-4">
              <CardTitle className="text-base">Last conversation</CardTitle>
              {lastConversation && (
                <CardDescription className="truncate">{lastConversation.title}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-3 px-4">
              {lastItemsLoading ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : !lastConversation || (!lastExchange.question && !lastExchange.answer) ? (
                <p className="text-sm text-muted-foreground">
                  Start a conversation to see it summarized here.
                </p>
              ) : (
                <>
                  {lastExchange.question && (
                    <div className="rounded-md bg-muted px-3 py-2 text-sm">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">You asked</p>
                      <p className="line-clamp-3">{lastExchange.question}</p>
                    </div>
                  )}
                  {lastExchange.answer && (
                    <div className="relative max-h-56 overflow-hidden">
                      <Markdown content={lastExchange.answer} />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent" />
                    </div>
                  )}
                  <Button asChild variant="outline" size="sm" className="self-start">
                    <Link to={`/chat?conversationId=${encodeURIComponent(lastConversation.conversation_id)}`}>
                      Open conversation
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
