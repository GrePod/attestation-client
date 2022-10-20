import { ChainType } from "@flarenetwork/mcc";
import { readJSON } from "../utils/config";
import { AttLogger, getGlobalLogger, logException } from "../utils/logger";
import { JSONMapParser } from "../utils/utils";
import { AttestationType } from "../verification/generated/attestation-types-enum";
import { SourceId, toSourceId } from "../verification/sources/sources";
import { AttestationRoundManager } from "./AttestationRoundManager";
import { AttesterClientConfiguration } from "./AttesterClientConfiguration";

const fs = require("fs");

// This whole script needs clarification??
/**
 * Weight presents the difficulty of validating the attestation depanding on the attestation type and source
 */
export class SourceHandlerTypeConfig {
  weight!: number;
}

// Why are these below classes??

/**
 * Class providing parameters for handling the limitations (maxTotalRoundWeight, quieryWindowInSec...) of a attestation round for a source
 */
export class SourceHandlerConfig {
  attestationType!: AttestationType; //Not needed?
  source!: SourceId;

  maxTotalRoundWeight!: number; //limits the the weighted amount of attestation for a given source per round

  numberOfConfirmations: number = 1;

  queryWindowInSec!: number; // To query what? Also not specified in doc
  UBPUnconfirmedWindowInSec!: number;

  attestationTypes = new Map<AttestationType, SourceHandlerTypeConfig>(); //What is number representing? (number=AttestationType)???
}

/**
 * Class providing SourceHandlerConfig for each source from the startEpoche on??
 */
export class AttestationConfig {
  startEpoch!: number; // start epoch of what? Epoch when this config starts being used??

  sourceHandlersConfig = new Map<SourceId, SourceHandlerConfig>(); //What is number representing? (number=SourceID)???
}

/**
 * Class for managing AttestationConfigs
 */
export class AttestationConfigManager {
  config: AttesterClientConfiguration;
  logger: AttLogger;

  attestationConfigs = new Array<AttestationConfig>(); //?????

  constructor(config: AttesterClientConfiguration, logger: AttLogger) {
    this.config = config;
    this.logger = logger;

    this.validateEnumNames();
  }
  /**
   * Checks that globaly set enumerations of chains in Multi Chain Client and Attestation Client match
   */
  validateEnumNames(): void {
    const logger = getGlobalLogger();

    for (let value in ChainType) {
      if (typeof ChainType[value] === "number") {
        if (ChainType[value] !== SourceId[value]) {
          logger.error2(
            `ChainType and Source value mismatch ChainType.${ChainType[ChainType[value] as any]}=${ChainType[value]}, Source.${
              SourceId[SourceId[value] as any]
            }=${SourceId[value]}`
          );
        }

        if (ChainType[ChainType[value] as any] !== SourceId[SourceId[value] as any]) {
          logger.error2(
            `ChainType and Source key mismatch ChainType.${ChainType[ChainType[value] as any]}=${ChainType[value]}, Source.${
              SourceId[SourceId[value] as any]
            }=${SourceId[value]}`
          );
        }
      }
    }
  }

  async initialize() {
    await this.loadAll();

    this.dynamicLoadInitialize();
  }

  /**
   * Check for changes in dynamicAttestationConfigurationFolder and loads new files
   */
  dynamicLoadInitialize(): void {
    try {
      fs.watch(this.config.dynamicAttestationConfigurationFolder, (event: string, filename: string) => {
        if (filename && event === "rename") {
          // todo: check why on the fly report JSON error
          this.logger.debug(`DAC directory watch '${filename}' (event ${event})`);
          if (this.load(this.config.dynamicAttestationConfigurationFolder + filename)) {
            this.orderConfigurations();
          }
        }
      });
    } catch (error) {
      this.logger.exception(error);
    }
  }

  /**
   * Loads all AttestationConfig that are stored in dynamicAttestationConfigurationFolder
   */
  async loadAll(): Promise<void> {
    try {
      await fs.readdir(this.config.dynamicAttestationConfigurationFolder, (err: number, files: string[]) => {
        if (files) {
          files.forEach((filename) => {
            this.load(this.config.dynamicAttestationConfigurationFolder + filename);
          });
          this.orderConfigurations();
        } else {
          this.logger.warning(`DAC: no configuration files`);
        }
      });
    } catch (error) {
      logException(error, `loadAll `);
    }
  }

  /**
   * Loads AttestationConfig from @param filename
   */
  load(filename: string, disregardObsolete: boolean = false): boolean {
    this.logger.info(`^GDAC load '${filename}'`);

    const fileConfig = readJSON<any>(filename, JSONMapParser);

    // check if loading current epoch (or next one)
    if (fileConfig.startEpoch == AttestationRoundManager.activeEpochId || fileConfig.startEpoch == AttestationRoundManager.activeEpochId + 1) {
      this.logger.warning(`DAC almost alive (epoch ${fileConfig.startEpoch})`);
    }

    // convert from file structure
    const config = new AttestationConfig();
    config.startEpoch = fileConfig.startEpoch;

    // parse sources
    fileConfig.sources.forEach(
      (source: {
        attestationTypes: any[];
        source: number;
        queryWindowInSec: number;
        UBPUnconfirmedWindowInSec: number;
        numberOfConfirmations: number;
        maxTotalRoundWeight: number;
      }) => {
        const sourceHandlerConfig = new SourceHandlerConfig(); //sourceHandler is not equal to SourceHandlerConfig

        sourceHandlerConfig.source = toSourceId(source.source);

        sourceHandlerConfig.maxTotalRoundWeight = source.maxTotalRoundWeight;
        sourceHandlerConfig.numberOfConfirmations = source.numberOfConfirmations;
        sourceHandlerConfig.queryWindowInSec = source.queryWindowInSec;
        sourceHandlerConfig.UBPUnconfirmedWindowInSec = source.UBPUnconfirmedWindowInSec;

        config.sourceHandlersConfig.set(sourceHandlerConfig.source, sourceHandlerConfig);

        // parse attestationTypes
        source.attestationTypes.forEach((attestationType) => {
          const type = (<any>AttestationType)[attestationType.type] as AttestationType;

          const attestationTypeHandler = new SourceHandlerTypeConfig();

          attestationTypeHandler.weight = attestationType.weight;

          sourceHandlerConfig.attestationTypes.set(type, attestationTypeHandler);
        });
      }
    );

    this.attestationConfigs.push(config);

    return true;
  }

  /**
   * Sorts attestationConfig based on the startEpoch and clears Configs for the passed epoches
   */
  orderConfigurations() {
    this.attestationConfigs.sort((a: AttestationConfig, b: AttestationConfig) => {
      if (a.startEpoch < b.startEpoch) return 1;
      if (a.startEpoch > b.startEpoch) return -1;
      return 0;
    });

    // cleanup
    for (let a = 1; a < this.attestationConfigs.length; a++) {
      if (this.attestationConfigs[a].startEpoch < AttestationRoundManager.activeEpochId) {
        this.logger.debug(`DAC cleanup #${a} (epoch ${this.attestationConfigs[a].startEpoch})`);
        this.attestationConfigs.slice(a);
        return;
      }
    }
  }

  /**
   * @returns SourceHandlerConfig for a given @param source that is valid for in @param epoch
   * ??? If there is none it returnes a default SourceHandlerConfig???
   */
  getSourceHandlerConfig(source: number, epoch: number): SourceHandlerConfig {
    // configs must be ordered by decreasing epoch number
    for (let a = 0; a < this.attestationConfigs.length; a++) {
      if (this.attestationConfigs[a].startEpoch < epoch) {
        return this.attestationConfigs[a].sourceHandlersConfig.get(source)!;
      }
    }

    this.logger.error(`DAC for source ${source} epoch ${epoch} does not exist (using default)`);

    return new SourceHandlerConfig();
  }
}
