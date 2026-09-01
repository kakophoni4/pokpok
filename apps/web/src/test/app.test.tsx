import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ME, player, renderApp, SEASON, stubApi, tournament } from "./harness";

const ANONYMOUS = { match: "POST /auth/refresh", status: 401, body: { code: "UNAUTHORIZED" } };
const SIGNED_IN = {
  match: "POST /auth/refresh",
  body: { accessToken: "token", expiresIn: 900, user: ME },
};
const ACTIVE_SEASON = { match: "GET /seasons/active", body: SEASON };

describe("schedule", () => {
  it("shows upcoming tournaments with seats and the waiting list", async () => {
    stubApi([
      ANONYMOUS,
      ACTIVE_SEASON,
      {
        match: "GET /tournaments?scope=upcoming",
        body: [
          tournament(),
          tournament({
            id: "t2",
            title: "PLO Night",
            capacity: 8,
            registeredCount: 8,
            waitlistCount: 2,
          }),
        ],
      },
    ]);

    renderApp("/");

    expect(await screen.findByText("Weekly Freezeout #16")).toBeInTheDocument();
    expect(screen.getByText("PLO Night")).toBeInTheDocument();
    expect(screen.getByText(/9\s*\/\s*12 участников/)).toBeInTheDocument();
    expect(screen.getByText(/\+ 2 в ожидании/)).toBeInTheDocument();
    // A full table must say so rather than offering a seat that does not exist.
    expect(screen.getByText("Мест нет")).toBeInTheDocument();
    expect(screen.getByText("Сезон 2026 - идёт сейчас")).toBeInTheDocument();
  });

  it("asks anonymous visitors to sign in instead of offering registration", async () => {
    stubApi([
      ANONYMOUS,
      ACTIVE_SEASON,
      { match: "GET /tournaments?scope=upcoming", body: [tournament()] },
    ]);

    renderApp("/");

    expect(await screen.findByText("Войти, чтобы записаться")).toBeInTheDocument();
    expect(screen.queryByText("Записаться")).not.toBeInTheDocument();
  });

  it("reports an API failure instead of showing an empty schedule", async () => {
    stubApi([
      ANONYMOUS,
      ACTIVE_SEASON,
      {
        match: "GET /tournaments?scope=upcoming",
        status: 500,
        body: { code: "INTERNAL", message: "База данных недоступна" },
      },
    ]);

    renderApp("/");

    // Queries retry once before surfacing an error, so allow for the backoff.
    expect(
      await screen.findByText("База данных недоступна", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  });
});

describe("registration", () => {
  it("signs the player up and reflects it on the card", async () => {
    let registered = false;

    const log = stubApi([
      SIGNED_IN,
      { match: "GET /auth/me", body: ME },
      ACTIVE_SEASON,
      {
        match: "GET /tournaments?scope=upcoming",
        body: () => [
          tournament(
            registered
              ? {
                  registeredCount: 10,
                  myRegistration: {
                    id: "r1",
                    status: "registered",
                    waitlistPosition: null,
                    createdAt: "2026-05-01T10:00:00.000Z",
                  },
                }
              : {},
          ),
        ],
      },
      {
        match: "POST /tournaments/t1/register",
        body: (() => {
          registered = true;
          return { status: "registered", waitlistPosition: null };
        }) as unknown as () => unknown,
      },
    ]);

    renderApp("/");

    const button = await screen.findByRole("button", { name: "Записаться" });
    fireEvent.click(button);

    expect(await screen.findByText("Вы записаны")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Отменить запись" })).toBeInTheDocument();

    const call = log.find((entry) => entry.path.startsWith("/tournaments/t1/register"));
    expect(call?.method).toBe("POST");
    expect(call?.body).toEqual({ source: "web" });
  });

  it("surfaces the server message when the seat is already taken", async () => {
    stubApi([
      SIGNED_IN,
      { match: "GET /auth/me", body: ME },
      ACTIVE_SEASON,
      { match: "GET /tournaments?scope=upcoming", body: [tournament()] },
      {
        match: "POST /tournaments/t1/register",
        status: 409,
        body: { code: "ALREADY_REGISTERED", message: "Вы уже записаны на этот турнир" },
      },
    ]);

    renderApp("/");

    fireEvent.click(await screen.findByRole("button", { name: "Записаться" }));
    expect(await screen.findByText("Вы уже записаны на этот турнир")).toBeInTheDocument();
  });
});

describe("leaderboard", () => {
  it("ranks players and marks the signed-in one", async () => {
    stubApi([
      SIGNED_IN,
      { match: "GET /auth/me", body: ME },
      ACTIVE_SEASON,
      { match: "GET /seasons", body: [SEASON] },
      {
        match: "GET /rating/leaderboard",
        body: [
          {
            rank: 1,
            user: player("u9", "Ira_Chips"),
            points: 261,
            gamesPlayed: 6,
            wins: 1,
            top3: 3,
            itm: 4,
            avgPlace: 4.5,
            bestPlace: 1,
          },
          {
            rank: 2,
            user: { ...player("u1", "Ferz"), role: "admin" },
            points: 221,
            gamesPlayed: 6,
            wins: 1,
            top3: 2,
            itm: 3,
            avgPlace: 5.2,
            bestPlace: 1,
          },
        ],
      },
    ]);

    renderApp("/rating");

    expect(await screen.findByText("Ira_Chips")).toBeInTheDocument();
    expect(screen.getByText("261")).toBeInTheDocument();
    expect(screen.getByText("вы")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сезон" })).toHaveTextContent("Сезон 2026 · сейчас");
  });
});

describe("personal cabinet", () => {
  it("shows season statistics and the rating history", async () => {
    stubApi([
      SIGNED_IN,
      { match: "GET /auth/me", body: ME },
      ACTIVE_SEASON,
      {
        match: "GET /rating/me",
        body: {
          user: { ...player("u1", "Ferz"), role: "admin" },
          seasonId: SEASON.id,
          points: 221,
          gamesPlayed: 6,
          wins: 1,
          top3: 2,
          itm: 3,
          avgPlace: 5.2,
          bestPlace: 1,
          rank: 2,
          progression: [
            { date: "2026-03-01T00:00:00.000Z", points: 40 },
            { date: "2026-04-01T00:00:00.000Z", points: 221 },
          ],
          history: [
            {
              id: "e1",
              createdAt: "2026-04-01T00:00:00.000Z",
              points: 120,
              sourceType: "tournament_result",
              comment: null,
              place: 1,
              tournament: {
                id: "t0",
                title: "Клубный мейджор «Осень»",
                startsAt: "2026-04-01T16:00:00.000Z",
                fieldSize: 14,
                paidPlaces: 9,
              },
              achievement: null,
            },
            {
              id: "e2",
              createdAt: "2026-04-02T00:00:00.000Z",
              points: -5,
              sourceType: "penalty",
              comment: "Не явился на турнир",
              place: null,
              tournament: null,
              achievement: null,
            },
          ],
        },
      },
      {
        match: "GET /achievements/user/u1",
        body: [
          {
            id: "ua1",
            achievement: {
              id: "a1",
              code: "first_win",
              title: "Первая победа",
              description: null,
              icon: "🥇",
              ratingPoints: 50,
              isActive: true,
              isRepeatable: false,
              rule: null,
            },
            grantedAt: "2026-03-10T00:00:00.000Z",
            grantedBy: null,
            tournamentId: null,
            comment: null,
          },
        ],
      },
    ]);

    renderApp("/me");

    await waitFor(() => expect(screen.getByText(/2 место/)).toBeInTheDocument());
    expect(screen.getByText("Клубный мейджор «Осень»")).toBeInTheDocument();
    expect(screen.getByText("+120")).toBeInTheDocument();
    // Penalties must read as a loss, not as a mysterious neutral row.
    expect(screen.getByText("-5")).toBeInTheDocument();
    expect(screen.getByText("Не явился на турнир")).toBeInTheDocument();
    expect(screen.getByText("Первая победа")).toBeInTheDocument();
    expect(screen.getByText("14 участников", { exact: false })).toBeInTheDocument();
  });
});
