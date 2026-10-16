import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';
import { SidebarInset, SidebarProvider } from '@databricks/appkit-ui/react';
import { AppSidebar } from './components/app-sidebar';
import { ChatPage } from './pages/chat';
import { DashboardPage } from './pages/dashboard';

/**
 * Remounts the chat page whenever a real navigation changes the query
 * string, so opening a conversation from the sidebar loads its history —
 * while in-stream `history.replaceState` updates stay out of the router and
 * never remount.
 */
function ChatRoute() {
  const location = useLocation();
  return <ChatPage key={location.search} />;
}

function Layout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/chat', element: <ChatRoute /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
