import { Address, Cell, type StateInit, beginCell, contractAddress } from "@ton/core";

export interface ReferenceNftCollectionDeployment {
  address: Address;
  init: StateInit;
  code: Cell;
  data: Cell;
}

export interface ReferenceNftCollectionDeploymentConfig {
  adminAddress: string;
  collectionMetadataUrl: string;
  commonContent?: string;
  royaltyAddress?: string;
  royaltyFactor?: number;
  royaltyBase?: number;
}

const REFERENCE_NFT_COLLECTION_CODE_HEX =
  "b5ee9c72410213010001fe000114ff00f4a413f4bcf2c80b01020162020c0202cd030703ebd10638048adf000e8698180b8d848adf07d201800e98fe99ff6a2687d20699fea6a6a184108349e9ca829405d47141baf8280e8410854658056b84008646582a802e78b127d010a65b509e58fe59f80e78b64c0207d80701b28b9e382f970c892e000f18112e001718119026001f1812f82c207f978404050600603502d33f5313bbf2e1925313ba01fa00d43028103459f0068e1201a44343c85005cf1613cb3fccccccc9ed54925f05e200a6357003d4308e378040f4966fa5208e2906a4208100fabe93f2c18fde81019321a05325bbf2f402fa00d43022544b30f00623ba9302a402de04926c21e2b3e6303250444313c85005cf1613cb3fccccccc9ed54002801fa40304144c85005cf1613cb3fccccccc9ed54020120080b020120090a002d007232cffe0a33c5b25c083232c044fd003d0032c03260001b3e401d3232c084b281f2fff27420003d45af0047021f005778018c8cb0558cf165004fa0213cb6b12ccccc971fb0080201200d120201200e0f0043b8b5d31ed44d0fa40d33fd4d4d43010245f04d0d431d430d071c8cb0701cf16ccc980201201011002fb5dafda89a1f481a67fa9a9a860d883a1a61fa61ff480610002db4f47da89a1f481a67fa9a9a86028be09e008e003e00b00025bc82df6a2687d20699fea6a6a182de86a182c4c07ebbf9";
const REFERENCE_NFT_ITEM_CODE_HEX =
  "b5ee9c7241020e010001dc000114ff00f4a413f4bcf2c80b01020162020d0202ce030a020120040902cf0c8871c02497c0f83434c0c05c6c2497c0f83e903e900c7e800c5c75c87e800c7e800c1cea6d003c00812ce3850c1b088d148cb1c17cb865407e90350c0408fc00f801b4c7f4cfe08417f30f45148c2eb8c08c0d0d0d4d60840bf2c9a884aeb8c097c12103fcbc20050802ac3210375e3240135135c705f2e191fa4021f001fa40d20031fa0020d749c200f2e2c4820afaf0801ba121945315a0a1de22d70b01c300209206a19136e220c2fff2e1922194102a375be30d0293303234e30d5502f0030607007c821005138d91c85009cf16500bcf16712449145446a0708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226eb39458cf17019132e201c901fb001047006a26f0018210d53276db103744006d71708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226eb39458cf17019132e201c901fb0000727082108b77173505c8cbff5004cf1610248040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226eb39458cf17019132e201c901fb0000113e910c1c2ebcb853600201200b0c003b3b513434cffe900835d27080269fc07e90350c04090408f80c1c165b5b60001d00f232cfd633c58073c5b3327b55200009a11f9fe00511f236fc";
const DEFAULT_ROYALTY_FACTOR = 0;
const DEFAULT_ROYALTY_BASE = 1000;

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const normalizeTonAddress = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, "")
    .slice(0, 160);
};

const decodeCellFromHex = (value: string): Cell => {
  const [cell] = Cell.fromBoc(Buffer.from(value, "hex"));

  if (!cell) {
    throw new Error("Failed to decode TON reference NFT contract cell");
  }

  return cell;
};

const buildOffchainContentCell = (uri: string): Cell => {
  return beginCell().storeUint(1, 8).storeStringRefTail(uri).endCell();
};

const buildRoyaltyCell = (params: {
  address: Address;
  royaltyFactor: number;
  royaltyBase: number;
}): Cell => {
  return beginCell()
    .storeUint(params.royaltyFactor, 16)
    .storeUint(params.royaltyBase, 16)
    .storeAddress(params.address)
    .endCell();
};

const buildCollectionDataCell = (params: {
  adminAddress: Address;
  collectionMetadataUrl: string;
  commonContent: string;
  itemCode: Cell;
  royaltyAddress: Address;
  royaltyFactor: number;
  royaltyBase: number;
}): Cell => {
  const content = beginCell()
    .storeRef(buildOffchainContentCell(params.collectionMetadataUrl))
    .storeRef(beginCell().storeStringTail(params.commonContent).endCell())
    .endCell();

  return beginCell()
    .storeAddress(params.adminAddress)
    .storeUint(0, 64)
    .storeRef(content)
    .storeRef(params.itemCode)
    .storeRef(
      buildRoyaltyCell({
        address: params.royaltyAddress,
        royaltyFactor: params.royaltyFactor,
        royaltyBase: params.royaltyBase,
      }),
    )
    .endCell();
};

export const getReferenceNftCollectionCodeCell = (): Cell => {
  return decodeCellFromHex(REFERENCE_NFT_COLLECTION_CODE_HEX);
};

export const getReferenceNftItemCodeCell = (): Cell => {
  return decodeCellFromHex(REFERENCE_NFT_ITEM_CODE_HEX);
};

export const buildReferenceNftCollectionDeployment = (
  config: ReferenceNftCollectionDeploymentConfig,
): ReferenceNftCollectionDeployment => {
  const adminAddress = normalizeTonAddress(config.adminAddress);
  const collectionMetadataUrl = normalizeText(config.collectionMetadataUrl, 600);
  const commonContent = normalizeText(config.commonContent, 300);
  const royaltyAddress = normalizeTonAddress(config.royaltyAddress) || adminAddress;
  const royaltyFactor = Math.max(0, Math.round(Number(config.royaltyFactor ?? DEFAULT_ROYALTY_FACTOR)));
  const royaltyBase = Math.max(1, Math.round(Number(config.royaltyBase ?? DEFAULT_ROYALTY_BASE)));

  if (!adminAddress) {
    throw new Error("TON NFT collection admin address is required");
  }

  if (!collectionMetadataUrl) {
    throw new Error("TON NFT collection metadata URL is required");
  }

  const admin = Address.parse(adminAddress);
  const royalty = Address.parse(royaltyAddress);
  const code = getReferenceNftCollectionCodeCell();
  const itemCode = getReferenceNftItemCodeCell();
  const data = buildCollectionDataCell({
    adminAddress: admin,
    collectionMetadataUrl,
    commonContent,
    itemCode,
    royaltyAddress: royalty,
    royaltyFactor,
    royaltyBase,
  });
  const init: StateInit = {
    code,
    data,
  };

  return {
    address: contractAddress(0, init),
    init,
    code,
    data,
  };
};
