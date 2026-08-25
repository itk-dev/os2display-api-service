import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

const { capturedForm, putMock, postMock, navigateMock } = vi.hoisted(() => ({
  capturedForm: { current: null },
  putMock: vi.fn(),
  postMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock("../../admin/components/screen/screen-form", () => ({
  default: (props) => {
    capturedForm.current = props;
    return null;
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock(
  "../../admin/components/util/list/toast-component/display-toast",
  () => ({
    displaySuccess: vi.fn(),
    displayError: vi.fn(),
  }),
);

vi.mock("../../shared/redux/enhanced-api.ts", () => ({
  usePutV2ScreensByIdMutation: () => [putMock, {}],
  usePostV2ScreensMutation: () => [postMock, {}],
}));

import ScreenManager from "../../admin/components/screen/screen-manager";

const SCREEN_ID = "01HQZX9K7MN4P2R6T8V0W3Y5AB";
const REGION_ID = "01HQZX9K7MN4P2R6T8V0W3Y5CD";
const PLAYLIST_ID = "01HQZX9K7MN4P2R6T8V0W3Y5EF";
const GROUP_ID = "01HQZX9K7MN4P2R6T8V0W3Y5GH";
const LAYOUT_ID = "01HQZX9K7MN4P2R6T8V0W3Y5IJ";

/** @returns {object} A screen as returned by GET /v2/screens/{id}. */
function makeServerScreen(checksum) {
  return {
    "@id": `/v2/screens/${SCREEN_ID}`,
    "@type": "Screen",
    title: "Screen",
    description: "",
    size: "",
    location: "",
    layout: `/v2/layouts/${LAYOUT_ID}`,
    orientation: "horizontal",
    resolution: "HD",
    enableColorSchemeChange: false,
    inScreenGroups: `/v2/screens/${SCREEN_ID}/screen-groups`,
    regions: [`/v2/screens/${SCREEN_ID}/regions/${REGION_ID}/playlists`],
    relationsChecksum: { regions: checksum },
  };
}

/** Mimics ScreenForm initializing the layout regions in the form state. */
function setRegionsFromLayout() {
  act(() => {
    capturedForm.current.handleInput({
      target: {
        id: "regions",
        value: [{ "@id": `/v2/layouts/regions/${REGION_ID}` }],
      },
    });
  });
}

/** Mimics GridGenerationAndSelect pushing the fetched playlists up. */
function setPlaylists() {
  act(() => {
    capturedForm.current.handleInput({
      target: {
        id: "playlists",
        value: [
          {
            "@id": `/v2/playlists/${PLAYLIST_ID}`,
            region: REGION_ID,
            weight: 0,
          },
        ],
      },
    });
  });
}

/** @returns {object} The parsed body of the last PUT. */
function lastPutBody() {
  return JSON.parse(putMock.mock.calls.at(-1)[0].screenScreenInputJsonld);
}

beforeEach(() => {
  capturedForm.current = null;
  putMock.mockReset();
  postMock.mockReset();
  navigateMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("ScreenManager background refetch", () => {
  it("does not wipe the selected playlists when the screen is refetched", () => {
    const { rerender } = render(
      <ScreenManager
        saveMethod="PUT"
        id={SCREEN_ID}
        initialState={makeServerScreen("aaa")}
      />,
    );

    setRegionsFromLayout();
    setPlaylists();

    // A mutation invalidating the "Screens" tag refetches GET /v2/screens/{id},
    // handing ScreenManager a new object for the same screen.
    rerender(
      <ScreenManager
        saveMethod="PUT"
        id={SCREEN_ID}
        initialState={makeServerScreen("bbb")}
      />,
    );

    act(() => {
      capturedForm.current.handleSubmitWithRedirect();
    });

    expect(lastPutBody().regions).toEqual([
      { regionId: REGION_ID, playlists: [{ id: PLAYLIST_ID, weight: 0 }] },
    ]);
  });

  it("does not wipe the screen groups when the screen is refetched", () => {
    const { rerender } = render(
      <ScreenManager
        saveMethod="PUT"
        id={SCREEN_ID}
        initialState={makeServerScreen("aaa")}
      />,
    );

    act(() => {
      capturedForm.current.handleInput({
        target: {
          id: "inScreenGroups",
          value: [`/v2/screen-groups/${GROUP_ID}`],
        },
      });
    });

    rerender(
      <ScreenManager
        saveMethod="PUT"
        id={SCREEN_ID}
        initialState={makeServerScreen("bbb")}
      />,
    );

    act(() => {
      capturedForm.current.handleSubmitWithRedirect();
    });

    expect(lastPutBody().groups).toEqual([GROUP_ID]);
  });

  it("omits regions and groups when the form never held them", () => {
    render(
      <ScreenManager
        saveMethod="PUT"
        id={SCREEN_ID}
        initialState={makeServerScreen("aaa")}
      />,
    );

    act(() => {
      capturedForm.current.handleSubmitWithRedirect();
    });

    const body = lastPutBody();
    expect(body).not.toHaveProperty("regions");
    expect(body).not.toHaveProperty("groups");
  });

  it("still sends an emptied region so playlists can be removed", () => {
    render(
      <ScreenManager
        saveMethod="PUT"
        id={SCREEN_ID}
        initialState={makeServerScreen("aaa")}
      />,
    );

    setRegionsFromLayout();
    setPlaylists();

    act(() => {
      capturedForm.current.handleInput({
        target: { id: "playlists", value: [] },
      });
    });

    act(() => {
      capturedForm.current.handleSubmitWithRedirect();
    });

    expect(lastPutBody().regions).toEqual([
      { regionId: REGION_ID, playlists: [] },
    ]);
  });
});
