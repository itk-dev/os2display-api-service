import { clientEmptySplitApi as api } from "./empty-api";
export const addTagTypes = [
  "Authentication",
  "Feeds",
  "Layouts",
  "Media",
  "Playlists",
  "ScreenGroups",
  "Screens",
  "Slides",
  "Templates",
  "Tenants",
  "Themes",
] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      postLoginInfoScreen: build.mutation<
        PostLoginInfoScreenApiResponse,
        PostLoginInfoScreenApiArg
      >({
        query: (queryArg) => ({
          url: `/v2/authentication/screen`,
          method: "POST",
          body: queryArg.screenLoginInput,
        }),
        invalidatesTags: ["Authentication"],
      }),
      postRefreshTokenItem: build.mutation<
        PostRefreshTokenItemApiResponse,
        PostRefreshTokenItemApiArg
      >({
        query: (queryArg) => ({
          url: `/v2/authentication/token/refresh`,
          method: "POST",
          body: queryArg.refreshTokenRequest,
        }),
        invalidatesTags: ["Authentication"],
      }),
      getV2FeedsByIdData: build.query<
        GetV2FeedsByIdDataApiResponse,
        GetV2FeedsByIdDataApiArg
      >({
        query: (queryArg) => ({ url: `/v2/feeds/${queryArg.id}/data` }),
        providesTags: ["Feeds"],
      }),
      getV2LayoutsById: build.query<
        GetV2LayoutsByIdApiResponse,
        GetV2LayoutsByIdApiArg
      >({
        query: (queryArg) => ({ url: `/v2/layouts/${queryArg.id}` }),
        providesTags: ["Layouts"],
      }),
      getV2MediaById: build.query<
        GetV2MediaByIdApiResponse,
        GetV2MediaByIdApiArg
      >({
        query: (queryArg) => ({ url: `/v2/media/${queryArg.id}` }),
        providesTags: ["Media"],
      }),
      getV2PlaylistsById: build.query<
        GetV2PlaylistsByIdApiResponse,
        GetV2PlaylistsByIdApiArg
      >({
        query: (queryArg) => ({ url: `/v2/playlists/${queryArg.id}` }),
        providesTags: ["Playlists"],
      }),
      getV2PlaylistsByIdSlides: build.query<
        GetV2PlaylistsByIdSlidesApiResponse,
        GetV2PlaylistsByIdSlidesApiArg
      >({
        query: (queryArg) => ({
          url: `/v2/playlists/${queryArg.id}/slides`,
          params: {
            page: queryArg.page,
            itemsPerPage: queryArg.itemsPerPage,
            published: queryArg.published,
          },
        }),
        providesTags: ["Playlists"],
      }),
      getV2ScreenGroupsByIdCampaigns: build.query<
        GetV2ScreenGroupsByIdCampaignsApiResponse,
        GetV2ScreenGroupsByIdCampaignsApiArg
      >({
        query: (queryArg) => ({
          url: `/v2/screen-groups/${queryArg.id}/campaigns`,
          params: {
            page: queryArg.page,
            itemsPerPage: queryArg.itemsPerPage,
            published: queryArg.published,
          },
        }),
        providesTags: ["ScreenGroups"],
      }),
      getV2ScreensById: build.query<
        GetV2ScreensByIdApiResponse,
        GetV2ScreensByIdApiArg
      >({
        query: (queryArg) => ({ url: `/v2/screens/${queryArg.id}` }),
        providesTags: ["Screens"],
      }),
      getV2ScreensByIdCampaigns: build.query<
        GetV2ScreensByIdCampaignsApiResponse,
        GetV2ScreensByIdCampaignsApiArg
      >({
        query: (queryArg) => ({
          url: `/v2/screens/${queryArg.id}/campaigns`,
          params: {
            page: queryArg.page,
            itemsPerPage: queryArg.itemsPerPage,
            published: queryArg.published,
          },
        }),
        providesTags: ["Screens"],
      }),
      getV2ScreensByIdRegionsAndRegionIdPlaylists: build.query<
        GetV2ScreensByIdRegionsAndRegionIdPlaylistsApiResponse,
        GetV2ScreensByIdRegionsAndRegionIdPlaylistsApiArg
      >({
        query: (queryArg) => ({
          url: `/v2/screens/${queryArg.id}/regions/${queryArg.regionId}/playlists`,
          params: {
            page: queryArg.page,
            itemsPerPage: queryArg.itemsPerPage,
            sharedWithMe: queryArg.sharedWithMe,
          },
        }),
        providesTags: ["Screens"],
      }),
      getV2ScreensByIdScreenGroups: build.query<
        GetV2ScreensByIdScreenGroupsApiResponse,
        GetV2ScreensByIdScreenGroupsApiArg
      >({
        query: (queryArg) => ({
          url: `/v2/screens/${queryArg.id}/screen-groups`,
          params: {
            page: queryArg.page,
            itemsPerPage: queryArg.itemsPerPage,
            order: queryArg.order,
          },
        }),
        providesTags: ["Screens"],
      }),
      getV2SlidesById: build.query<
        GetV2SlidesByIdApiResponse,
        GetV2SlidesByIdApiArg
      >({
        query: (queryArg) => ({ url: `/v2/slides/${queryArg.id}` }),
        providesTags: ["Slides"],
      }),
      getV2TemplatesById: build.query<
        GetV2TemplatesByIdApiResponse,
        GetV2TemplatesByIdApiArg
      >({
        query: (queryArg) => ({ url: `/v2/templates/${queryArg.id}` }),
        providesTags: ["Templates"],
      }),
      getV2TenantsById: build.query<
        GetV2TenantsByIdApiResponse,
        GetV2TenantsByIdApiArg
      >({
        query: (queryArg) => ({ url: `/v2/tenants/${queryArg.id}` }),
        providesTags: ["Tenants"],
      }),
      getV2ThemesById: build.query<
        GetV2ThemesByIdApiResponse,
        GetV2ThemesByIdApiArg
      >({
        query: (queryArg) => ({ url: `/v2/themes/${queryArg.id}` }),
        providesTags: ["Themes"],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as clientApi };
export type PostLoginInfoScreenApiResponse =
  /** status 200 Login with bindKey to get JWT token for screen */ ScreenLoginOutputRead;
export type PostLoginInfoScreenApiArg = {
  /** Get login info with JWT token for given nonce */
  screenLoginInput: ScreenLoginInput;
};
export type PostRefreshTokenItemApiResponse =
  /** status 200 Refresh JWT token */ RefreshTokenResponseRead;
export type PostRefreshTokenItemApiArg = {
  /** Refresh JWT Token */
  refreshTokenRequest: RefreshTokenRequest;
};
export type GetV2FeedsByIdDataApiResponse = /** status 200 undefined */ Blob;
export type GetV2FeedsByIdDataApiArg = {
  id: string;
};
export type GetV2LayoutsByIdApiResponse = /** status 200 OK */ Blob;
export type GetV2LayoutsByIdApiArg = {
  id: string;
};
export type GetV2MediaByIdApiResponse = /** status 200 OK */ Blob;
export type GetV2MediaByIdApiArg = {
  id: string;
};
export type GetV2PlaylistsByIdApiResponse = /** status 200 OK */ Blob;
export type GetV2PlaylistsByIdApiArg = {
  id: string;
};
export type GetV2PlaylistsByIdSlidesApiResponse = /** status 200 OK */ Blob;
export type GetV2PlaylistsByIdSlidesApiArg = {
  id: string;
  page: number;
  /** The number of items per page */
  itemsPerPage?: string;
  /** If true only published content will be shown */
  published?: boolean;
};
export type GetV2ScreenGroupsByIdCampaignsApiResponse =
  /** status 200 OK */ Blob;
export type GetV2ScreenGroupsByIdCampaignsApiArg = {
  id: string;
  page: number;
  /** The number of items per page */
  itemsPerPage?: string;
  /** If true only published content will be shown */
  published?: boolean;
};
export type GetV2ScreensByIdApiResponse = /** status 200 OK */ Blob;
export type GetV2ScreensByIdApiArg = {
  id: string;
};
export type GetV2ScreensByIdCampaignsApiResponse = /** status 200 OK */ Blob;
export type GetV2ScreensByIdCampaignsApiArg = {
  id: string;
  page: number;
  /** The number of items per page */
  itemsPerPage?: string;
  /** If true only published content will be shown */
  published?: boolean;
};
export type GetV2ScreensByIdRegionsAndRegionIdPlaylistsApiResponse =
  /** status 200 PlaylistScreenRegion collection */ {
    "hydra:member": PlaylistScreenRegionJsonldPlaylistScreenRegionReadRead[];
    "hydra:totalItems"?: number;
    "hydra:view"?: {
      "@id"?: string;
      "@type"?: string;
      "hydra:first"?: string;
      "hydra:last"?: string;
      "hydra:previous"?: string;
      "hydra:next"?: string;
    };
    "hydra:search"?: {
      "@type"?: string;
      "hydra:template"?: string;
      "hydra:variableRepresentation"?: string;
      "hydra:mapping"?: {
        "@type"?: string;
        variable?: string;
        property?: string | null;
        required?: boolean;
      }[];
    };
  };
export type GetV2ScreensByIdRegionsAndRegionIdPlaylistsApiArg = {
  id: string;
  regionId: string;
  page: number;
  /** The number of items per page */
  itemsPerPage?: string;
  /** If true only entities that are shared with me will be shown */
  sharedWithMe?: boolean;
};
export type GetV2ScreensByIdScreenGroupsApiResponse =
  /** status 200 ScreenGroup collection */ {
    "hydra:member": ScreenGroupScreenGroupJsonldScreensScreenGroupsReadRead[];
    "hydra:totalItems"?: number;
    "hydra:view"?: {
      "@id"?: string;
      "@type"?: string;
      "hydra:first"?: string;
      "hydra:last"?: string;
      "hydra:previous"?: string;
      "hydra:next"?: string;
    };
    "hydra:search"?: {
      "@type"?: string;
      "hydra:template"?: string;
      "hydra:variableRepresentation"?: string;
      "hydra:mapping"?: {
        "@type"?: string;
        variable?: string;
        property?: string | null;
        required?: boolean;
      }[];
    };
  };
export type GetV2ScreensByIdScreenGroupsApiArg = {
  id: string;
  page: number;
  /** The number of items per page */
  itemsPerPage?: string;
  order?: {
    title?: "asc" | "desc";
    description?: "asc" | "desc";
  };
};
export type GetV2SlidesByIdApiResponse = /** status 200 OK */ Blob;
export type GetV2SlidesByIdApiArg = {
  id: string;
};
export type GetV2TemplatesByIdApiResponse = /** status 200 OK */ Blob;
export type GetV2TemplatesByIdApiArg = {
  id: string;
};
export type GetV2TenantsByIdApiResponse = /** status 200 OK */ Blob;
export type GetV2TenantsByIdApiArg = {
  id: string;
};
export type GetV2ThemesByIdApiResponse = /** status 200 OK */ Blob;
export type GetV2ThemesByIdApiArg = {
  id: string;
};
export type ScreenLoginOutput = {};
export type ScreenLoginOutputRead = {
  bindKey?: string;
  token?: string;
};
export type ScreenLoginInput = object;
export type RefreshTokenResponse = {};
export type RefreshTokenResponseRead = {
  token?: string;
  refresh_token?: string;
};
export type RefreshTokenRequest = {
  refresh_token?: string;
};
export type CollectionJsonldPlaylistScreenRegionRead = {};
export type CollectionJsonldPlaylistScreenRegionReadRead = {
  "@context"?:
    | string
    | {
        "@vocab": string;
        hydra: "http://www.w3.org/ns/hydra/core#";
        [key: string]: any;
      };
  "@id"?: string;
  "@type"?: string;
};
export type PlaylistJsonldPlaylistScreenRegionRead = {
  title?: string;
  description?: string;
  schedules?: string[] | null;
  slides?: string;
  campaignScreens?: CollectionJsonldPlaylistScreenRegionRead | null;
  campaignScreenGroups?: CollectionJsonldPlaylistScreenRegionRead | null;
  tenants?: CollectionJsonldPlaylistScreenRegionRead | null;
  isCampaign?: boolean;
  slidesLength?: number | null;
  published?: string[];
  relationsChecksum?: object;
};
export type PlaylistJsonldPlaylistScreenRegionReadRead = {
  "@context"?:
    | string
    | {
        "@vocab": string;
        hydra: "http://www.w3.org/ns/hydra/core#";
        [key: string]: any;
      };
  "@id"?: string;
  "@type"?: string;
  title?: string;
  description?: string;
  schedules?: string[] | null;
  slides?: string;
  campaignScreens?: CollectionJsonldPlaylistScreenRegionReadRead | null;
  campaignScreenGroups?: CollectionJsonldPlaylistScreenRegionReadRead | null;
  tenants?: CollectionJsonldPlaylistScreenRegionReadRead | null;
  isCampaign?: boolean;
  slidesLength?: number | null;
  published?: string[];
  relationsChecksum?: object;
};
export type PlaylistScreenRegionJsonldPlaylistScreenRegionRead = {
  playlist?: PlaylistJsonldPlaylistScreenRegionRead;
  weight?: number;
  relationsChecksum?: object;
};
export type PlaylistScreenRegionJsonldPlaylistScreenRegionReadRead = {
  "@id"?: string;
  "@type"?: string;
  playlist?: PlaylistJsonldPlaylistScreenRegionReadRead;
  weight?: number;
  relationsChecksum?: object;
};
export type ScreenGroupScreenGroupJsonldScreensScreenGroupsRead = {
  title?: string;
  description?: string;
  campaigns?: string;
  screens?: string;
  screensLength?: number | null;
  campaignsLength?: number | null;
  relationsChecksum?: object;
};
export type ScreenGroupScreenGroupJsonldScreensScreenGroupsReadRead = {
  "@id"?: string;
  "@type"?: string;
  title?: string;
  description?: string;
  campaigns?: string;
  screens?: string;
  screensLength?: number | null;
  campaignsLength?: number | null;
  relationsChecksum?: object;
};
export const {
  usePostLoginInfoScreenMutation,
  usePostRefreshTokenItemMutation,
  useGetV2FeedsByIdDataQuery,
  useGetV2LayoutsByIdQuery,
  useGetV2MediaByIdQuery,
  useGetV2PlaylistsByIdQuery,
  useGetV2PlaylistsByIdSlidesQuery,
  useGetV2ScreenGroupsByIdCampaignsQuery,
  useGetV2ScreensByIdQuery,
  useGetV2ScreensByIdCampaignsQuery,
  useGetV2ScreensByIdRegionsAndRegionIdPlaylistsQuery,
  useGetV2ScreensByIdScreenGroupsQuery,
  useGetV2SlidesByIdQuery,
  useGetV2TemplatesByIdQuery,
  useGetV2TenantsByIdQuery,
  useGetV2ThemesByIdQuery,
} = injectedRtkApi;
