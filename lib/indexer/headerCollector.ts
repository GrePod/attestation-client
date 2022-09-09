import { IBlock, Managed } from "@flarenetwork/mcc";
import { LiteBlock } from "@flarenetwork/mcc/dist/src/base-objects/blocks/LiteBlock";
import { AttLogger } from "../utils/logger";
import { getRetryFailureCallback, retry, retryMany } from "../utils/PromiseTimeout";
import { sleepms } from "../utils/utils";
import { Indexer } from "./indexer";
import { UnconfirmedBlockManager } from "./UnconfirmedBlockManager";

/**
 * Manages the block header collection on a blockchain.
 */
@Managed()
export class HeaderCollector {
  private indexer: Indexer;

  private logger: AttLogger;

  private blockHeaderHash = new Set<string>();
  private blockHeaderNumber = new Set<number>();
  // Use this only on non-forkable chains
  private blockNumberHash = new Map<number, string>();

  constructor(logger: AttLogger, indexer: Indexer) {
    this.logger = logger;
    this.indexer = indexer;
  }

  /////////////////////////////////////////////////////////////
  // caching
  /////////////////////////////////////////////////////////////

  private isBlockCached(block: IBlock) {
    return this.blockHeaderHash.has(block.stdBlockHash) && this.blockHeaderNumber.has(block.number);
  }

  private cacheBlock(block: IBlock) {
    this.blockHeaderHash.add(block.stdBlockHash);
    this.blockHeaderNumber.add(block.number);
    this.blockNumberHash.set(block.number, block.stdBlockHash);
  }

  /////////////////////////////////////////////////////////////
  // saving blocks
  /////////////////////////////////////////////////////////////

  /**
   * Saves block headers in the range of block numbers. It is used on chains without
   * forks.
   * @param fromBlockNumber starting block number (included, should be greater than N on indexer)
   * @param toBlockNumberInc ending block number (included)
   */
  public async readAndSaveBlocksHeaders(fromBlockNumber: number, toBlockNumberInc: number) {
    // assert - this should never happen
    if (fromBlockNumber <= this.indexer.N) {
      let onFailure = getRetryFailureCallback();
      onFailure("saveBlocksHeaders: fromBlock too low");
      // this should exit the program
    }
    const blockPromisses = [];

    for (let blockNumber = fromBlockNumber; blockNumber <= toBlockNumberInc; blockNumber++) {
      // // if rawUnforkable then we can skip block numbers if they are already written
      // if (this.indexer.chainConfig.blockCollecting === "rawUnforkable") {
      //   if (this.blockHeaderNumber.has(blockNumber)) {
      //     continue;
      //   }
      // }
      blockPromisses.push(async () => this.indexer.getBlockFromClient(`saveBlocksHeaders`, blockNumber));
    }

    let blocks = (await retryMany(`saveBlocksHeaders`, blockPromisses, 5000, 5)) as IBlock[];
    blocks = blocks.filter(block => !this.isBlockCached(block));
    await this.saveBlocksOrHeadersOnNewTips(blocks);
  }

  /**
   * Saves blocks or headers in the array, if block.number > N.
   * Block numbers <= N are ignored.
   * Note that for case of non-forkable chains it caches mapping 
   * from block number to block (header). This mapping (`blockNumberHash`)
   * should not be used with forkable chains.
   * 
   * NOTE: the function is not subject to race conditions with processing of 
   * confirmed blocks since only blockNumber, blockHash and timestamp are updated
   * in the block table if an entry in dbBlock table already exists.
   * @param blocks array of headers
   * @returns 
   */
  public async saveBlocksOrHeadersOnNewTips(blocks: IBlock[]) {
    let blocksText = "[";

    let unconfirmedBlockManager = new UnconfirmedBlockManager(this.indexer.dbService, this.indexer.dbBlockClass, this.indexer.N);
    await unconfirmedBlockManager.initialize();

    for (const block of blocks) {
      // due to the above async call N could increase
      if (!block || !block.stdBlockHash || block.number <= this.indexer.N) {
        continue;
      }
      const blockNumber = block.number;

      // check cache
      if (this.isBlockCached(block)) {
        // cached
        blocksText += "^G" + blockNumber.toString() + "^^,";
        continue;
      } else {
        // new
        blocksText += blockNumber.toString() + ",";
      }

      this.cacheBlock(block);

      const actualBlock = await this.indexer.getBlockFromClientByHash("saveBlocksOrHeadersOnNewTips", block.blockHash);

      const dbBlock = new this.indexer.dbBlockClass();

      dbBlock.blockNumber = blockNumber;
      dbBlock.blockHash = block.stdBlockHash;
      dbBlock.timestamp = actualBlock.unixTimestamp;
      dbBlock.numberOfConfirmations = 1;
      dbBlock.previousBlockHash = actualBlock.previousBlockHash;

      // dbBlocks.push(dbBlock);
      unconfirmedBlockManager.addNewBlock(dbBlock);
    }

    let dbBlocks = unconfirmedBlockManager.getChangedBlocks();

    // remove all blockNumbers <= N. Note that N might have changed after the above 
    // async query
    dbBlocks = dbBlocks.filter(dbBlock => dbBlock.blockNumber > this.indexer.N);

    if (dbBlocks.length === 0) {
      //this.logger.debug(`write block headers (no new blocks)`);
      return;
    }

    this.logger.debug(`write block headers ${blocksText}]`);

    await retry(`saveBlocksHeadersArray`, async () => await this.indexer.dbService.manager.save(dbBlocks));
  }

  /////////////////////////////////////////////////////////////
  // save state
  /////////////////////////////////////////////////////////////
  /**
   * Saves the last top height into the database state
   * @param T top height
   */
  private async writeT(T: number) {
    // every update save last T
    const stateTcheckTime = this.indexer.getStateEntry("T", T);

    await retry(`writeT`, async () => await this.indexer.dbService.manager.save(stateTcheckTime));
  }

  /////////////////////////////////////////////////////////////
  // header collectors
  /////////////////////////////////////////////////////////////

  /**
   * For non-forkable chains we monitor and save chain height
   */
  async runBlockHeaderCollectingRaw() {
    let T = -1;
    while (true) {
      // get chain top block
      const newT = await this.indexer.getBlockHeightFromClient(`runBlockHeaderCollectingRaw`);
      if (T != newT) {
        await this.writeT(newT);
        T = newT;
      }
      await sleepms(this.indexer.config.blockCollectTimeMs);
    }
  }

  /**
   * Collects block headers on forkable (PoW/UTXO) chains and saves them into the database
   */
  async runBlockHeaderCollectingTips() {
    let T = -1;
    while (true) {
      // get chain top block
      const newT = await this.indexer.getBlockHeightFromClient(`runBlockHeaderCollectingTips`);
      if (T != newT) {
        await this.writeT(newT);
        T = newT;
      }

      const blocks: LiteBlock[] = await this.indexer.cachedClient.client.getTopLiteBlocks(this.indexer.chainConfig.numberOfConfirmations);

      await this.saveBlocksOrHeadersOnNewTips(blocks);

      await sleepms(this.indexer.config.blockCollectTimeMs);
    }
  }

  async runBlockHeaderCollecting() {
    switch (this.indexer.chainConfig.blockCollecting) {
      case "raw":
      case "latestBlock":
      case "rawUnforkable":
        this.runBlockHeaderCollectingRaw();
        break;
      case "tips":
        this.runBlockHeaderCollectingTips();
        break;
    }
  }
}
