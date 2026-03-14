import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { importTsModule } from "../helpers/load-ts-module.mjs";

const modulePath = path.resolve(process.cwd(), "src/lib/server/ton-reference-nft-contract.ts");
const { buildReferenceNftCollectionDeployment } = await importTsModule(modulePath);

test("buildReferenceNftCollectionDeployment creates deterministic testnet address", () => {
  const deployment = buildReferenceNftCollectionDeployment({
    adminAddress: "kQBB0PJbUURYcpvTap49-F6vctE8noIE2BGyi67Kmx9Is_62",
    collectionMetadataUrl: "https://c3k-blog.vercel.app/api/ton/nft/metadata/collection",
  });

  assert.equal(
    deployment.address.toString({ testOnly: true }),
    "kQCZHa0l-osWuvUKby3C4ExQhqGRrayIkKJcYWcxqHwium57",
  );
});
