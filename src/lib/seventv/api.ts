// 7TV v4 GraphQL API. Public, no login needed.
import type { Platform } from "../chat/types";

const GQL_URL = "https://7tv.io/v4/gql";

/** Users per lookup; 7TV rejects queries above a complexity limit, and 25 small lookups fit. */
export const USER_BATCH_SIZE = 25;

export interface PaintStop {
  at: number;
  color: { hex: string };
}

export type PaintLayerType =
  | { __typename: "PaintLayerTypeSingleColor"; color: { hex: string } }
  | { __typename: "PaintLayerTypeLinearGradient"; angle: number; repeating: boolean; stops: PaintStop[] }
  | { __typename: "PaintLayerTypeRadialGradient"; repeating: boolean; shape: "CIRCLE" | "ELLIPSE"; stops: PaintStop[] }
  | { __typename: "PaintLayerTypeImage"; images: CdnImage[] };

export interface CdnImage {
  url: string;
  mime: string;
  scale: number;
  frameCount?: number;
}

export interface Paint {
  id: string;
  name: string;
  data: {
    layers: { opacity: number; ty: PaintLayerType }[];
    shadows: { color: { hex: string }; offsetX: number; offsetY: number; blur: number }[];
  };
}

export interface SevenTvBadge {
  id: string;
  name: string;
  images: CdnImage[];
}

export interface UserStyle {
  paintId: string | null;
  badgeId: string | null;
}

async function gql<T>(query: string): Promise<T> {
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`7TV returned HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`7TV: ${json.errors[0].message}`);
  return json.data as T;
}

const PAINT_FIELDS = `id name data {
  layers { opacity ty { __typename
    ... on PaintLayerTypeSingleColor { color { hex } }
    ... on PaintLayerTypeLinearGradient { angle repeating stops { at color { hex } } }
    ... on PaintLayerTypeRadialGradient { repeating shape stops { at color { hex } } }
    ... on PaintLayerTypeImage { images { url mime scale frameCount } }
  } }
  shadows { color { hex } offsetX offsetY blur }
}`;

/** Every paint and badge 7TV has (~1 MB). Loaded once; individual users then only need IDs. */
export async function fetchCatalog(): Promise<{ paints: Paint[]; badges: SevenTvBadge[] }> {
  const data = await gql<{ paints: { paints: Paint[] }; badges: { badges: SevenTvBadge[] } }>(
    `{ paints { paints { ${PAINT_FIELDS} } } badges { badges { id name images { url mime scale } } } }`,
  );
  return { paints: data.paints.paints, badges: data.badges.badges };
}

/** Active paint/badge IDs for up to USER_BATCH_SIZE users. Users without 7TV map to null. */
export async function fetchUserStyles(platform: Platform, ids: string[]): Promise<Map<string, UserStyle | null>> {
  const gqlPlatform = platform === "twitch" ? "TWITCH" : "YOUTUBE";
  const fields = ids
    .map(
      (id, i) =>
        `u${i}: userByConnection(platform: ${gqlPlatform}, platformId: ${JSON.stringify(id)}) { style { activePaint { id } activeBadge { id } } }`,
    )
    .join("\n");
  type Result = { style: { activePaint: { id: string } | null; activeBadge: { id: string } | null } } | null;
  const data = await gql<{ users: Record<string, Result> }>(`{ users { ${fields} } }`);
  const out = new Map<string, UserStyle | null>();
  ids.forEach((id, i) => {
    const user = data.users[`u${i}`];
    out.set(
      id,
      user ? { paintId: user.style.activePaint?.id ?? null, badgeId: user.style.activeBadge?.id ?? null } : null,
    );
  });
  return out;
}
