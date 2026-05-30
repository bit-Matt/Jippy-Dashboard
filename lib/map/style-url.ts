const getTileserverBaseUrl = () => {
  const baseUrl = process.env.NEXT_PUBLIC_TILESERVER_URL;

  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_TILESERVER_URL is required to build map style URLs.");
  }

  return baseUrl.replace(/\/$/, "");
};

const buildStyleUrl = (stylePath: string) => `${getTileserverBaseUrl()}${stylePath}`;

export const getPositronStyleUrl = () => buildStyleUrl("/styles/positron/style.json");

export const getLibertyStyleUrl = () => buildStyleUrl("/styles/liberty/style.json");
