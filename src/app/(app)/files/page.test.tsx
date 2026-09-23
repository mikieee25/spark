import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  service: vi.fn(),
  database: vi.fn(),
  favorites: vi.fn(),
  recent: vi.fn(),
}));

vi.mock("@/features/auth/request-auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/files/file-runtime", () => ({ getFileService: mocks.service }));
vi.mock("@/lib/db/runtime", () => ({ getDatabase: mocks.database }));
vi.mock("@/features/discovery/discovery-repository", () => ({ listFavorites: mocks.favorites, listRecentItems: mocks.recent }));

import FilesPage from "./page";

describe("FilesPage", () => {
  it("renders the workspace shell without listing the filesystem on the server", async () => {
    mocks.user.mockResolvedValue({ id: "u1", role: "user" });
    mocks.database.mockReturnValue({});
    mocks.favorites.mockReturnValue([]);
    mocks.recent.mockReturnValue([]);

    const element = await FilesPage();

    expect(mocks.service).not.toHaveBeenCalled();
    expect(element.props.initialEntries).toBeNull();
  });
});
