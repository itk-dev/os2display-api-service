// The client is a display, not an editor: it reads the screen it is bound to
// and the content hanging off it, and nothing else. Generating all 86 operations
// shipped every admin endpoint — create, update, delete included — to a device
// standing unattended in a public space. These are the operations the client
// actually calls; see assets/client/service and assets/client/core/api-query.js.
//
// Names here are the generated endpoint keys, which is what filterEndpoints
// matches on. Adding a call in the client means adding its name here first, or
// the endpoint will not exist on clientApi.
const clientEndpoints = [
  // Authentication.
  "postLoginInfoScreen",
  "postRefreshTokenItem",
  // The screen and its layout.
  "getV2ScreensById",
  "getV2LayoutsById",
  "getV2ScreensByIdRegionsAndRegionIdPlaylists",
  // Campaigns, both direct and via screen groups.
  "getV2ScreensByIdCampaigns",
  "getV2ScreensByIdScreenGroups",
  "getV2ScreenGroupsByIdCampaigns",
  // Playlists and slides.
  "getV2PlaylistsById",
  "getV2PlaylistsByIdSlides",
  "getV2SlidesById",
  // Slide relations.
  "getV2TemplatesById",
  "getV2MediaById",
  "getV2FeedsByIdData",
  "getV2ThemesById",
  // Tenant config.
  "getV2TenantsById",
];

const config = {
  schemaFile: "../../../public/api-spec-v2.json",
  apiFile: "./empty-api.ts",
  apiImport: "clientEmptySplitApi",
  outputFile: "./generated-api.ts",
  exportName: "clientApi",
  hooks: true,
  tag: true,
  filterEndpoints: clientEndpoints,
  endpointOverrides: [
    {
      pattern: /.*/,
      parameterFilter: (_name, parameter) => {
        // Filter out parameters from OpenAPI specification that results in
        // invalid javascript with duplicate query parameters.
        return !(
          ["createdBy", "modifiedBy", "supportedFeedOutputType"].includes(
            _name,
          ) && parameter.style === "deepObject"
        );
      },
    },
  ],
};

export default config;
