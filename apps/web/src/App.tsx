import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/auth-context";
import { Layout } from "./components/Layout";
import { EmptyState, Loading } from "./components/ui";

// Only staff ever open this, so players should not download it.
const AdminPage = lazy(() =>
  import("./pages/admin/AdminPage").then((module) => ({ default: module.AdminPage })),
);
import { AchievementsPage } from "./pages/AchievementsPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { LoginPage } from "./pages/LoginPage";
import { PlayerPage } from "./pages/PlayerPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RulesPage } from "./pages/RulesPage";
import { SchedulePage } from "./pages/SchedulePage";
import { TournamentPage } from "./pages/TournamentPage";

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        // The schedule changes while people are looking at it; refetching on
        // focus is cheap and avoids someone signing up for a seat that just went.
        refetchOnWindowFocus: true,
      },
    },
  });
}

export function App() {
  // Owned by the component rather than the module, so the cache lives and dies
  // with the app instance instead of leaking across mounts.
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<SchedulePage />} />
              <Route path="t/:id" element={<TournamentPage />} />
              <Route path="rating" element={<LeaderboardPage />} />
              <Route path="player/:id" element={<PlayerPage />} />
              <Route path="achievements" element={<AchievementsPage />} />
              <Route path="me" element={<ProfilePage />} />
              <Route path="login" element={<LoginPage />} />
              <Route path="rules" element={<RulesPage />} />
              <Route
                path="admin"
                element={
                  <Suspense fallback={<Loading />}>
                    <AdminPage />
                  </Suspense>
                }
              />
              <Route
                path="*"
                element={
                  <EmptyState title="Страница не найдена" description="Проверьте адрес." />
                }
              />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
