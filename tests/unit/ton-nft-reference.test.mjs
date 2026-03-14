import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { Address } from "@ton/core";

import { importTsModule } from "../helpers/load-ts-module.mjs";

const modulePath = path.resolve(process.cwd(), "src/lib/server/ton-nft-reference.ts");
const {
  buildReferenceNftItemContentValue,
  buildReferenceNftMintBody,
  resolveTonNftCollectionAddress,
  resolveTonNftItemContentPrefix,
} = await importTsModule(modulePath);

test("resolveTonNftItemContentPrefix uses public metadata route by default", () => {
  assert.equal(
    resolveTonNftItemContentPrefix({
      publicBaseUrl: "https://c3k.example/",
      env: {},
    }),
    "https://c3k.example/api/ton/nft/metadata/releases/",
  );
});

test("buildReferenceNftItemContentValue supports {slug} placeholder", () => {
  assert.equal(
    buildReferenceNftItemContentValue({
      itemContentPrefix: "releases/{slug}.json",
      releaseSlug: "Midnight Echo",
    }),
    "releases/midnight-echo.json",
  );
});

test("resolveTonNftCollectionAddress ignores legacy mint address fallback", () => {
  assert.equal(
    resolveTonNftCollectionAddress({
      TON_NFT_COLLECTION_ADDRESS: "",
      NEXT_PUBLIC_TON_NFT_COLLECTION_ADDRESS: "",
      NEXT_PUBLIC_TON_MINT_ADDRESS: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
    }),
    "",
  );
});

test("buildReferenceNftMintBody encodes reference collection deploy payload", () => {
  const ownerAddress = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";
  const payload = buildReferenceNftMintBody({
    itemIndex: 7n,
    ownerAddress,
    itemContentValue: "releases/midnight-echo",
    itemValueNano: 30_000_000n,
    queryId: 11n,
  });

  const slice = payload.beginParse();
  assert.equal(slice.loadUint(32), 1);
  assert.equal(slice.loadUintBig(64), 11n);
  assert.equal(slice.loadUintBig(64), 7n);
  assert.equal(slice.loadCoins(), 30_000_000n);

  const nftItemContent = slice.loadRef().beginParse();
  assert.equal(nftItemContent.loadAddress().toString(), Address.parse(ownerAddress).toString());
  assert.equal(nftItemContent.loadRef().beginParse().loadStringTail(), "releases/midnight-echo");
});
