import type {
  Achievement,
  AddPaymentInput,
  AdminUpdateUserInput,
  ClubMenuItem,
  ClubSettings,
  ClubVenue,
  ClubVenueInput,
  CreateAchievementInput,
  CreateClubMenuItemInput,
  CreateSeasonInput,
  CreateTournamentInput,
  GrantAchievementInput,
  LeaderboardRow,
  MeUser,
  Paginated,
  PlayerStats,
  PublicUser,
  RegistrationView,
  Season,
  SubmitResultsInput,
  SalesPeriod,
  SalesReport,
  TournamentDetail,
  TournamentPlayer,
  TournamentSummary,
  UpdateAchievementInput,
  UpdateClubMenuItemInput,
  UpdateClubSettingsInput,
  UpdateTournamentInput,
  UserAchievementView,
} from "@poker/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, query } from "./api";

/**
 * Query keys are grouped so a mutation can invalidate exactly the slice it
 * affects, e.g. signing up refreshes the schedule but not the leaderboard.
 */
export const keys = {
  tournaments: (scope: string) => ["tournaments", scope] as const,
  tournament: (id: string) => ["tournament", id] as const,
  registrations: (id: string) => ["registrations", id] as const,
  leaderboard: (seasonId: string, search: string) => ["leaderboard", seasonId, search] as const,
  myStats: () => ["rating", "me"] as const,
  playerStats: (userId: string) => ["rating", "player", userId] as const,
  achievements: (includeInactive: boolean) => ["achievements", includeInactive] as const,
  userAchievements: (userId: string) => ["achievements", "user", userId] as const,
  seasons: () => ["seasons"] as const,
  activeSeason: () => ["seasons", "active"] as const,
  players: (search: string) => ["players", search] as const,
  clubInfo: () => ["club", "info"] as const,
  clubSettings: () => ["club", "settings"] as const,
  sales: (period: string, seasonId: string) => ["club", "sales", period, seasonId] as const,
};

export function useTournaments(scope: "upcoming" | "past" | "all", enabled = true) {
  return useQuery({
    queryKey: keys.tournaments(scope),
    queryFn: () => api.get<TournamentSummary[]>(`/tournaments${query({ scope })}`),
    enabled,
  });
}

export function useTournament(id: string | undefined) {
  return useQuery({
    queryKey: keys.tournament(id ?? ""),
    queryFn: () => api.get<TournamentDetail>(`/tournaments/${id}`),
    enabled: Boolean(id),
  });
}

export function useRegistrations(id: string | undefined) {
  return useQuery({
    queryKey: keys.registrations(id ?? ""),
    queryFn: () => api.get<RegistrationView[]>(`/tournaments/${id}/registrations`),
    enabled: Boolean(id),
  });
}

export function useLeaderboard(seasonId: string | undefined, search = "") {
  return useQuery({
    queryKey: keys.leaderboard(seasonId ?? "", search),
    queryFn: () =>
      api.get<LeaderboardRow[]>(`/rating/leaderboard${query({ seasonId, search })}`),
    enabled: Boolean(seasonId),
  });
}

export function useMyStats(enabled: boolean) {
  return useQuery({
    queryKey: keys.myStats(),
    queryFn: () => api.get<PlayerStats>("/rating/me"),
    enabled,
  });
}

export function usePlayerStats(userId: string | undefined) {
  return useQuery({
    queryKey: keys.playerStats(userId ?? ""),
    queryFn: () => api.get<PlayerStats>(`/rating/player/${userId}`),
    enabled: Boolean(userId),
  });
}

export function useAchievements(includeInactive = false) {
  return useQuery({
    queryKey: keys.achievements(includeInactive),
    queryFn: () => api.get<Achievement[]>(`/achievements${query({ includeInactive })}`),
  });
}

export function useUserAchievements(userId: string | undefined) {
  return useQuery({
    queryKey: keys.userAchievements(userId ?? ""),
    queryFn: () => api.get<UserAchievementView[]>(`/achievements/user/${userId}`),
    enabled: Boolean(userId),
  });
}

export function useActiveSeason() {
  return useQuery({
    queryKey: keys.activeSeason(),
    queryFn: () => api.get<Season | null>("/seasons/active"),
  });
}

export function useSeasons() {
  return useQuery({
    queryKey: keys.seasons(),
    queryFn: () => api.get<Season[]>("/seasons"),
  });
}

export function useCreateSeason() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSeasonInput) => api.post<Season>("/seasons", input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["seasons"] });
      void client.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
}

export function useFinishSeason() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Season>(`/seasons/${id}/finish`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["seasons"] });
      void client.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
}

export function usePlayers(search: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.players(search),
    queryFn: () =>
      api.get<Paginated<PublicUser & { status: string; createdAt: string }>>(
        `/users${query({ search, perPage: 100 })}`,
      ),
    enabled,
  });
}

export function useClubInfo() {
  return useQuery({
    queryKey: keys.clubInfo(),
    queryFn: () => api.get<{ infoText: string; timezone: string }>("/club/info"),
    // The club does not move; refetching this on every mount is pointless.
    staleTime: 5 * 60_000,
  });
}

export function useClubSettings(enabled: boolean) {
  return useQuery({
    queryKey: keys.clubSettings(),
    queryFn: () => api.get<ClubSettings>("/club/settings"),
    enabled,
  });
}

export function useSales(period: SalesPeriod, seasonId?: string) {
  return useQuery({
    queryKey: keys.sales(period, seasonId ?? ""),
    queryFn: () => api.get<SalesReport>(`/club/sales${query({ period, seasonId })}`),
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useRegister(tournamentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (source: "web" | "miniapp" = "web") =>
      api.post<{ status: string; waitlistPosition: number | null }>(
        `/tournaments/${tournamentId}/register`,
        { source },
      ),
    onSuccess: () => invalidateSchedule(client, tournamentId),
  });
}

/** Seat a club player who walked in without signing up. Staff only. */
export function useStaffRegister(tournamentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api.post<{ status: string; waitlistPosition: number | null }>(
        `/tournaments/${tournamentId}/register`,
        { userId, source: "admin" },
      ),
    onSuccess: () => invalidateSchedule(client, tournamentId),
  });
}

export function useCancelRegistration(tournamentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/tournaments/${tournamentId}/register`),
    onSuccess: () => invalidateSchedule(client, tournamentId),
  });
}

export function useStaffCancelRegistration(tournamentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/tournaments/${tournamentId}/register${query({ userId })}`),
    onSuccess: () => invalidateSchedule(client, tournamentId),
  });
}

export function useCreateTournament() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTournamentInput) =>
      api.post<TournamentSummary>("/tournaments", input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["tournaments"] }),
  });
}

export function useUpdateTournament(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTournamentInput) =>
      api.patch<TournamentSummary>(`/tournaments/${id}`, input),
    onSuccess: () => invalidateSchedule(client, id),
  });
}

export function useDeleteTournament() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tournaments/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["tournaments"] }),
  });
}

export function useSubmitResults(tournamentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitResultsInput) =>
      api.post(`/tournaments/${tournamentId}/results`, input),
    onSuccess: () => {
      invalidateSchedule(client, tournamentId);
      // Standings and every player's history change; refetch them all.
      void client.invalidateQueries({ queryKey: ["leaderboard"] });
      void client.invalidateQueries({ queryKey: ["rating"] });
    },
  });
}

export function useAddPayment(tournamentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AddPaymentInput) =>
      api.post<TournamentPlayer>(`/tournaments/${tournamentId}/payments`, input),
    onSuccess: () => invalidateSchedule(client, tournamentId),
  });
}

export function useVoidPayment(tournamentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) =>
      api.delete(`/tournaments/${tournamentId}/payments/${paymentId}`),
    onSuccess: () => invalidateSchedule(client, tournamentId),
  });
}

export function useSetPlace(tournamentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, place }: { userId: string; place: number | null }) =>
      api.post<TournamentPlayer>(`/tournaments/${tournamentId}/place`, { userId, place }),
    onSuccess: () => invalidateSchedule(client, tournamentId),
  });
}

/** Awarding the rating, and taking it back — both are ordinary operations. */
export function useFinishTournament(tournamentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reopen: boolean) =>
      api.post(`/tournaments/${tournamentId}/${reopen ? "reopen" : "finish"}`),
    onSuccess: () => {
      invalidateSchedule(client, tournamentId);
      void client.invalidateQueries({ queryKey: ["leaderboard"] });
      void client.invalidateQueries({ queryKey: ["rating"] });
    },
  });
}

export function useUpdateClubSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateClubSettingsInput) =>
      api.patch<ClubSettings>("/club/settings", input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["club"] }),
  });
}

export function useCreateMenuItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClubMenuItemInput) => api.post<ClubMenuItem>("/club/menu", input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["club"] }),
  });
}

export function useUpdateMenuItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateClubMenuItemInput }) =>
      api.patch<ClubMenuItem>(`/club/menu/${id}`, input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["club"] }),
  });
}

export function useDeleteMenuItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/club/menu/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["club"] }),
  });
}

export function useCreateVenue() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ClubVenueInput) => api.post<ClubVenue>("/club/venues", input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["club"] });
      void client.invalidateQueries({ queryKey: ["tournaments"] });
    },
  });
}

export function useUpdateVenue() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ClubVenueInput }) =>
      api.patch<ClubVenue>(`/club/venues/${id}`, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["club"] });
      void client.invalidateQueries({ queryKey: ["tournaments"] });
    },
  });
}

export function useDeleteVenue() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/club/venues/${id}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["club"] });
      void client.invalidateQueries({ queryKey: ["tournaments"] });
    },
  });
}

export function useCreateAchievement() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAchievementInput) => api.post<Achievement>("/achievements", input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["achievements"] }),
  });
}

export function useUpdateAchievement() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAchievementInput }) =>
      api.patch<Achievement>(`/achievements/${id}`, input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["achievements"] }),
  });
}

export function useGrantAchievement() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: GrantAchievementInput) => api.post("/achievements/grant", input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["achievements"] });
      void client.invalidateQueries({ queryKey: ["leaderboard"] });
      void client.invalidateQueries({ queryKey: ["rating"] });
      void client.invalidateQueries({ queryKey: ["tournament"] });
    },
  });
}

export function useRevokeAchievement() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (grantId: string) => api.delete(`/achievements/grant/${grantId}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["achievements"] });
      void client.invalidateQueries({ queryKey: ["leaderboard"] });
      void client.invalidateQueries({ queryKey: ["rating"] });
      void client.invalidateQueries({ queryKey: ["tournament"] });
    },
  });
}

export function useUpdatePlayer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdminUpdateUserInput }) =>
      api.patch<MeUser>(`/users/${id}`, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["players"] });
      void client.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
}

function invalidateSchedule(
  client: ReturnType<typeof useQueryClient>,
  tournamentId: string,
): void {
  void client.invalidateQueries({ queryKey: ["tournaments"] });
  void client.invalidateQueries({ queryKey: keys.tournament(tournamentId) });
  void client.invalidateQueries({ queryKey: keys.registrations(tournamentId) });
}
