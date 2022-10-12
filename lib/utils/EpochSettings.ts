import BN from "bn.js";
import { toBN } from "@flarenetwork/mcc";
import { getTimeSec } from "./internetTime";

/**
 * Class for storing the settings of epochs. Current length of an epoch is 90 seconds.
 * For the connection between rounds and epoches see Attestation-protocol.md
 */
export class EpochSettings {
  private _firstEpochStartTime: BN; // in seconds
  private _epochPeriod: BN; // in seconds

  private _firstEpochId: BN = toBN(0);

  // all values are in seconds
  constructor(_firstEpochStartTime: BN, _epochPeriod: BN) {
    this._firstEpochStartTime = _firstEpochStartTime.mul(toBN(1000));
    this._epochPeriod = _epochPeriod.mul(toBN(1000));
  }

  getEpochLengthMs(): BN {
    return this._epochPeriod;
  }

  getEpochIdForTime(timeInMillis: BN): BN {
    const diff: BN = timeInMillis.sub(this._firstEpochStartTime);
    return this._firstEpochId.add(diff.div(this._epochPeriod));
  }

  /**
   * Gets the id of the current epoch. It is the same as the id of the round that is currently in the request phase   *
   */
  getCurrentEpochId(): BN {
    return this.getEpochIdForTime(toBN(getTimeSec() * 1000));
  }

  // // in seconds
  // getEpochTimeStart(): BN {
  //   const id: BN = this.getCurrentEpochId().add(toBN(1)).add(this._firstEpochId);
  //   return this._firstEpochStartTime.add(id.mul(this._epochPeriod));
  // }

  // // in seconds
  // getEpochTimeEnd(): BN {
  //   return this.getEpochTimeStart().add(this._epochPeriod);
  // }

  /**
   * Gets the start time of the round in milliseconds. The round starts in the request phase.
   */
  getRoundIdTimeStartMs(round: BN | number): number {
    return this._firstEpochStartTime.add(toBN(round).mul(this._epochPeriod)).toNumber(); // + this._epochPeriod.toNumber();
  }

  /**
   * Gets the end time of the epoch in milliseconds
   */
  getEpochIdTimeEndMs(epochid: BN | number): number {
    return this.getRoundIdTimeStartMs(epochid) + this._epochPeriod.toNumber();
  }

  /**
   * Gets the start time of the commit phase of the round in milliseconds
   */
  getRoundIdCommitTimeStartMs(round: BN | number): number {
    return this.getRoundIdTimeStartMs(round) + this._epochPeriod.toNumber();
  }

  /**
   * Gets the start time of the Reveal phase of the round in milliseconds
   */
  getRoundIdRevealTimeStartMs(round: number): number {
    return this.getRoundIdCommitTimeStartMs(round) + this._epochPeriod.toNumber();
  }
}
