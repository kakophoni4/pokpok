import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminAchievements } from "../pages/admin/AdminAchievements";
import { defaultAwardArt } from "../lib/award-art";
import { stubApi } from "./harness";

const award = {
  id: "award1", code: "first_win", title: "Первая победа",
  description: "Победа в турнире", category: "club", icon: "🏆",
  ratingPoints: 100, isActive: true, isRepeatable: false, holdersCount: 1,
};
function renderEditor() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AdminAchievements canEdit />
  </QueryClientProvider>);
}
describe("award artwork selection", () => {
  it("saves a chosen image independently of the achievement text and points", async () => {
    const calls = stubApi([
      { match: "GET /achievements", body: [award] },
      { match: "PATCH /achievements/award1", body: { ...award, icon: "/images/awards/phoenix.svg" } },
    ]);
    renderEditor();
    fireEvent.click(await screen.findByRole("button", { name: "Изображение: текущее" }));
    fireEvent.click(screen.getByRole("button", { name: /^Феникс$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Сохранить$/ }));
    await waitFor(() => expect(calls.find(c => c.method === "PATCH")?.body).toMatchObject({
      icon: "/images/awards/phoenix.svg", title: award.title, ratingPoints: 100,
    }));
  });
  it("gives the existing named awards distinct default silhouettes", () => {
    const titles = ["Чемпион сезона", "Триумфатор", "Душа клуба", "Ни одной пропущенной", "Первая победа", "Постоянный игрок", "Хозяин подиума"];
    expect(new Set(titles.map(title => defaultAwardArt({ title, code: "" }))).size).toBe(7);
  });
});
