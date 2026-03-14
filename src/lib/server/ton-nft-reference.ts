import { Address, type Cell, type TupleItem, type TupleReader, beginCell } from "@ton/core";

export interface ReferenceNftCollectionData {
  nextItemIndex: bigint;
  ownerAddress?: Address;
}

export interface ReferenceNftItemData {
  initialized: boolean;
  index: bigint;
  collectionAddress?: Address;
  ownerAddress?: Address;
  individualContent?: string;
}

const REFERENCE_NFT_DEPLOY_OP = 1;

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const normalizeSlug = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
};

const normalizeTonAddress = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, "")
    .slice(0, 160);
};

const parseBooleanFlag = (value: unknown, fallback: boolean): boolean => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off", "disabled"].includes(normalized)) {
    return false;
  }

  return fallback;
};

const stripTrailingSlashes = (value: string): string => {
  return value.replace(/\/+$/, "");
};

const parseAddress = (value: Address | string | null | undefined): Address | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Address) {
    return value;
  }

  const normalized = normalizeTonAddress(value);

  if (!normalized) {
    return null;
  }

  try {
    return Address.parse(normalized);
  } catch {
    return null;
  }
};

export const isTonOnchainNftMintEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => {
  return parseBooleanFlag(env.TON_ONCHAIN_NFT_MINT_ENABLED ?? env.NEXT_PUBLIC_TON_ONCHAIN_NFT_MINT_ENABLED, false);
};

export const resolveTonNftCollectionAddress = (env: NodeJS.ProcessEnv = process.env): string => {
  return normalizeTonAddress(
    env.TON_NFT_COLLECTION_ADDRESS || env.NEXT_PUBLIC_TON_NFT_COLLECTION_ADDRESS || env.NEXT_PUBLIC_TON_MINT_ADDRESS,
  );
};

export const resolveTonNftItemContentPrefix = (params: {
  publicBaseUrl?: string | null;
  env?: NodeJS.ProcessEnv;
}): string => {
  const env = params.env ?? process.env;
  const explicitPrefix = normalizeText(env.TON_NFT_ITEM_CONTENT_PREFIX, 400);

  if (explicitPrefix) {
    return explicitPrefix;
  }

  const baseUrl = stripTrailingSlashes(normalizeText(params.publicBaseUrl ?? env.NEXT_PUBLIC_APP_URL, 400));

  if (!baseUrl) {
    return "";
  }

  return `${baseUrl}/api/ton/nft/metadata/releases/`;
};

export const buildReferenceNftItemContentValue = (params: {
  itemContentPrefix: string;
  releaseSlug: string;
}): string => {
  const releaseSlug = normalizeSlug(params.releaseSlug);
  const itemContentPrefix = normalizeText(params.itemContentPrefix, 400);

  if (!releaseSlug || !itemContentPrefix) {
    return "";
  }

  if (itemContentPrefix.includes("{slug}")) {
    return itemContentPrefix.replace(/\{slug\}/g, releaseSlug);
  }

  return `${itemContentPrefix}${releaseSlug}`;
};

export const buildReferenceNftMintBody = (params: {
  itemIndex: bigint;
  ownerAddress: string;
  itemContentValue: string;
  itemValueNano: bigint;
  queryId?: bigint;
}): Cell => {
  const ownerAddress = parseAddress(params.ownerAddress);
  const itemContentValue = normalizeText(params.itemContentValue, 400);

  if (!ownerAddress || !itemContentValue || params.itemIndex < BigInt(0) || params.itemValueNano <= BigInt(0)) {
    throw new Error("Invalid TON NFT mint payload");
  }

  const nftItemContentCell = beginCell()
    .storeAddress(ownerAddress)
    .storeRef(beginCell().storeStringTail(itemContentValue).endCell())
    .endCell();

  return beginCell()
    .storeUint(REFERENCE_NFT_DEPLOY_OP, 32)
    .storeUint(params.queryId ?? BigInt(0), 64)
    .storeUint(params.itemIndex, 64)
    .storeCoins(params.itemValueNano)
    .storeRef(nftItemContentCell)
    .endCell();
};

export const buildReferenceNftIndexStack = (itemIndex: bigint): TupleItem[] => {
  return [{ type: "int", value: itemIndex }];
};

export const parseReferenceNftCollectionData = (stack: TupleReader): ReferenceNftCollectionData => {
  const nextItemIndex = stack.readBigNumber();
  stack.readCell();
  const ownerAddress = stack.readAddressOpt() ?? undefined;

  return {
    nextItemIndex,
    ownerAddress,
  };
};

export const parseReferenceNftItemData = (stack: TupleReader): ReferenceNftItemData => {
  const initialized = stack.readBoolean();
  const index = stack.readBigNumber();
  const collectionAddress = stack.readAddressOpt() ?? undefined;
  const ownerAddress = stack.readAddressOpt() ?? undefined;
  const contentCell = stack.readCellOpt();
  const individualContent = contentCell ? contentCell.beginParse().loadStringTail() : undefined;

  return {
    initialized,
    index,
    collectionAddress,
    ownerAddress,
    individualContent,
  };
};

export const areTonAddressesEqual = (
  left: Address | string | null | undefined,
  right: Address | string | null | undefined,
): boolean => {
  const parsedLeft = parseAddress(left);
  const parsedRight = parseAddress(right);

  if (!parsedLeft || !parsedRight) {
    return false;
  }

  return parsedLeft.equals(parsedRight);
};
