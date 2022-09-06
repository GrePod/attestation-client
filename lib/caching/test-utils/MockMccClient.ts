import { ChainType, getTransactionOptions, IBlock, INodeStatus, ITransaction, MccError, ReadRpcInterface, unPrefix0x, XrpBlock, XrpTransaction } from "@flarenetwork/mcc";
import { LiteBlock } from "@flarenetwork/mcc/dist/src/base-objects/blocks/LiteBlock";
import Web3 from "web3";
import * as xrpTxResponse from "./xrp-tx-response.json";
import * as xrpBlockResponse from "./xrp-block-response.json";

export class MockMccClient implements ReadRpcInterface {

   web3 = new Web3();
   getNodeStatus(): Promise<INodeStatus> {
      throw new Error("Method not implemented.");
   }
   getBottomBlockHeight(): Promise<number> {
      throw new Error("Method not implemented.");
   }
   async getBlock(blockNumberOrHash: any): Promise<IBlock> {
      let respData = { ...xrpBlockResponse.data };
      if (typeof blockNumberOrHash === "string") {
         let number = this.randomBlockNumber();
         respData.result = { ...respData.result, ledger_index: number, ledger_hash: blockNumberOrHash }
      } else {
         respData.result = { ...respData.result, ledger_index: blockNumberOrHash, ledger_hash: this.randomHash32(true) }
      }
      let txTemplate = new XrpBlock(respData as any);
      return txTemplate;
   }
   getBlockHeight(): Promise<number> {
      throw new Error("Method not implemented.");
   }
   getBlockTips?(height_gte: number): Promise<LiteBlock[]> {
      throw new Error("Method not implemented.");
   }
   getTopLiteBlocks?(branch_len: number): Promise<LiteBlock[]> {
      throw new Error("Method not implemented.");
   }
   async getTransaction(txId: string, metaData?: getTransactionOptions): Promise<ITransaction> {
      if(txId === "") {
         throw MccError("XXX error"); // for testing purposes
      }
      let respData = { ...xrpTxResponse.data };
      respData.result = { ...respData.result, hash: unPrefix0x(txId).toUpperCase() }
      let txTemplate = new XrpTransaction(respData as any);
      return txTemplate;
   }

   listTransactions?(options?: any) {
      throw new Error("Method not implemented.");
   }
   chainType: ChainType;

   public randomHash32(unprefixAndUppercase = false) {
      let res = this.web3.utils.randomHex(32);
      if (!unprefixAndUppercase) {
         return res;
      }
      return unPrefix0x(res).toUpperCase();
   }

   public randomBlockNumber() {
      return Math.floor(Math.random() * 1000000)  + 1;
   }
}